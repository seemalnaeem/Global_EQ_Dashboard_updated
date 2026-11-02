"""USGS earthquake feed ingest: fetch a GeoJSON summary feed, normalize each
feature to the canonical quake shape, and upsert into PostGIS. Duplicate
guard is the `UNIQUE (source, source_id)` constraint on `quakes` (see
db/init/02_schema.sql); ON CONFLICT makes re-polling the same window
idempotent. See skills/usgs-ingest and rules/geospatial.md.

The continuous poll loop lives in app/main.py (background asyncio task);
this module only does one fetch+upsert per call, so it is reusable from
both the loop and POST /quakes/ingest.
"""
import logging
import os
from datetime import datetime, timezone

import requests
from fastapi import APIRouter, HTTPException
from psycopg.types.json import Json
from pydantic import BaseModel

from app.db import get_connection

logger = logging.getLogger("quakes")

router = APIRouter(prefix="/quakes", tags=["quakes"])

USGS_FEED_BASE = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary"
DEFAULT_FEED = os.environ.get("USGS_FEED", "all_day")
_HTTP_TIMEOUT = 15


class IngestRequest(BaseModel):
    feed: str | None = None


def _normalize_lon(lon: float) -> float:
    """Some feeds report longitude in 0..360; fold to -180..180."""
    lon = ((lon + 180.0) % 360.0) - 180.0
    return lon


def _parse_feature(feature: dict) -> dict | None:
    """Normalize one USGS GeoJSON feature to the canonical quake row.
    Returns None (and logs) for a truly unparseable record: missing id,
    missing/short coordinates, or unparseable time. Null magnitude, null
    depth, and null place are all valid and kept as null, never defaulted.
    """
    try:
        source_id = feature["id"]
        geometry = feature.get("geometry") or {}
        coords = geometry.get("coordinates") or []
        if not source_id or len(coords) < 2:
            raise ValueError(f"missing id or coordinates: {feature.get('id')!r}")

        lon = _normalize_lon(float(coords[0]))
        lat = float(coords[1])
        depth_km = float(coords[2]) if len(coords) > 2 and coords[2] is not None else None

        props = feature.get("properties") or {}
        mag = props.get("mag")
        magnitude = float(mag) if mag is not None else None

        time_ms = props.get("time")
        if time_ms is None:
            raise ValueError(f"missing time for feature {source_id}")
        occurred_at = datetime.fromtimestamp(time_ms / 1000.0, tz=timezone.utc)

        place = props.get("place")

        return {
            "source": "usgs",
            "source_id": str(source_id),
            "lon": lon,
            "lat": lat,
            "depth_km": depth_km,
            "magnitude": magnitude,
            "occurred_at": occurred_at,
            "place": place,
            "raw": feature,
        }
    except Exception as exc:
        logger.warning("usgs: skipping unparseable feature %s: %s", feature.get("id"), exc)
        return None


def fetch_usgs(feed_level: str | None = None) -> list[dict]:
    """HTTP GET the USGS summary feed and normalize every feature. One bad
    record is logged and skipped, it never aborts the batch. Retries with
    backoff on transient HTTP/network failures (429, 5xx, timeout).
    """
    level = feed_level or DEFAULT_FEED
    url = f"{USGS_FEED_BASE}/{level}.geojson"

    last_exc: Exception | None = None
    backoffs = [1, 2, 4]
    response = None
    for wait_s in [0, *backoffs]:
        if wait_s:
            import time

            time.sleep(wait_s)
        try:
            response = requests.get(url, timeout=_HTTP_TIMEOUT)
            if response.status_code == 429 or response.status_code >= 500:
                last_exc = RuntimeError(f"usgs feed {level}: HTTP {response.status_code}")
                response = None
                continue
            response.raise_for_status()
            last_exc = None
            break
        except requests.RequestException as exc:
            last_exc = exc
            response = None
            continue

    if response is None:
        raise RuntimeError(f"usgs feed {level} unreachable after retries: {last_exc}")

    try:
        payload = response.json()
    except ValueError as exc:
        raise RuntimeError(f"usgs feed {level}: invalid JSON: {exc}")

    features = payload.get("features") or []
    rows: list[dict] = []
    for feature in features:
        row = _parse_feature(feature)
        if row is not None:
            rows.append(row)
    return rows


def upsert_quakes(rows: list[dict]) -> int:
    """Batch upsert normalized rows into `quakes`. ON CONFLICT (source,
    source_id) refreshes the mutable fields; the raw payload and geometry
    are kept in sync with the latest poll. Returns the number of rows
    written (inserted or updated).
    """
    if not rows:
        return 0

    sql = """
        INSERT INTO quakes (source, source_id, geom, magnitude, depth_km, occurred_at, place, raw)
        VALUES (%(source)s, %(source_id)s,
                ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography,
                %(magnitude)s, %(depth_km)s, %(occurred_at)s, %(place)s, %(raw)s)
        ON CONFLICT (source, source_id) DO UPDATE SET
            magnitude = EXCLUDED.magnitude,
            depth_km = EXCLUDED.depth_km,
            occurred_at = EXCLUDED.occurred_at,
            place = EXCLUDED.place,
            raw = EXCLUDED.raw,
            ingested_at = now()
    """
    params = [
        {
            "source": row["source"],
            "source_id": row["source_id"],
            "lon": row["lon"],
            "lat": row["lat"],
            "magnitude": row["magnitude"],
            "depth_km": row["depth_km"],
            "occurred_at": row["occurred_at"],
            "place": row["place"],
            "raw": Json(row["raw"]),
        }
        for row in rows
    ]

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, params)
        conn.commit()
    return len(rows)


def run_ingest_once(feed_level: str | None = None) -> dict:
    """Fetch and upsert once. Shared by POST /quakes/ingest and the
    background poll loop in app/main.py so behavior matches exactly.
    """
    level = feed_level or DEFAULT_FEED
    rows = fetch_usgs(level)
    upserted = upsert_quakes(rows)
    return {"fetched": len(rows), "upserted": upserted, "feed": level}


@router.post("/ingest")
def ingest_now(req: IngestRequest | None = None):
    """Run one fetch+upsert immediately and return the counts. Feed level
    defaults to USGS_FEED (env) if not given in the body.
    """
    feed_level = (req.feed if req else None) or DEFAULT_FEED
    try:
        return run_ingest_once(feed_level)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/status")
def status():
    """Poll status: last run timestamp/error from the background loop
    (app/main.py), plus a live count of ingested USGS rows."""
    from app.main import poll_status

    total_usgs = None
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM quakes WHERE source = 'usgs'")
                row = cur.fetchone()
                total_usgs = row[0] if row else None
    except Exception as exc:
        logger.warning("quakes/status: count query failed: %s", exc)

    return {
        "last_poll_at": poll_status.get("last_poll_at"),
        "last_error": poll_status.get("last_error"),
        "last_upserted": poll_status.get("last_upserted"),
        "total_usgs": total_usgs,
    }
