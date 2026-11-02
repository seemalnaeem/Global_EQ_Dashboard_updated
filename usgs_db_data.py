"""USGS historical ingestion into the portal's `quakes` table.

Adapted from the original standalone script so it writes into THIS portal's
database and the exact table the dashboard reads:
  - connection points at the portal DB (earthquake / eq / host port 5438),
    overridable via env (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).
  - rows go into `quakes` with its real schema (source, source_id, geom
    geography, magnitude, depth_km, occurred_at, place, raw) and the table's
    ON CONFLICT (source, source_id) upsert, so ingested events appear on the map.
  - a small retry/backoff wraps each USGS request so a transient 503/429 does
    not abort the whole run.

Range and magnitude floor are env-overridable (START_YEAR, END_YEAR,
MIN_MAGNITUDE) so a single year can be smoke-tested before the full run.

Run on the host (which has psycopg2 + requests):
    python usgs_db_data.py
    START_YEAR=2011 END_YEAR=2011 MIN_MAGNITUDE=6 python usgs_db_data.py   # test
"""
import os
import time
from datetime import datetime, timezone, timedelta

import requests
import psycopg2
from psycopg2.extras import Json

# ----------------- PostgreSQL CONFIG (this portal) -----------------
DB = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "port": int(os.environ.get("DB_PORT", "5438")),      # host-published port
    "database": os.environ.get("DB_NAME", "earthquake"),
    "user": os.environ.get("DB_USER", "eq"),
    "password": os.environ.get("DB_PASSWORD", "eq"),
}
# -------------------------------------------------------------------

START_YEAR = int(os.environ.get("START_YEAR", "1900"))
END_YEAR = int(os.environ.get("END_YEAR", "2026"))
MIN_MAGNITUDE = float(os.environ.get("MIN_MAGNITUDE", "2.5"))

# Resume checkpoint. The loop is year-by-year in order, so the last fully
# committed year is a high-water mark: everything up to it is done. That year is
# stored in `usgs_ingest_checkpoint` in the same DB, so a restart resumes at the
# next year instead of redoing from START_YEAR. Set FRESH=1 to ignore it.
CHECKPOINT_JOB = os.environ.get("JOB", "usgs_yearly")
FRESH = os.environ.get("FRESH", "").lower() in ("1", "true", "yes")

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
PAGE_LIMIT = 20000
HTTP_TIMEOUT = 120
# How many times to retry a whole year (with a growing cooldown) on a transient
# USGS/network outage before stopping cleanly for a later resume.
MAX_YEAR_ATTEMPTS = 5


def _normalize_lon(lon):
    """Some feeds report longitude in 0..360; fold to -180..180."""
    return ((lon + 180.0) % 360.0) - 180.0


# ----------------- FETCH WITH PAGINATION + RETRY -----------------
def _get_json(url):
    """GET with retry/backoff on 429, 5xx, and network errors."""
    last_exc = None
    for wait_s in [0, 5, 15, 30, 60]:
        if wait_s:
            time.sleep(wait_s)
        try:
            resp = requests.get(url, timeout=HTTP_TIMEOUT)
            if resp.status_code == 429 or resp.status_code >= 500:
                last_exc = RuntimeError(f"USGS HTTP {resp.status_code}")
                continue
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            last_exc = exc
            continue
    raise RuntimeError(f"USGS unreachable after retries: {last_exc}")


def fetch_year_data(year):
    starttime = f"{year}-01-01"
    endtime = f"{year}-12-31"

    offset = 1
    all_features = []

    print(f"\nFetching earthquakes for {year}...")

    while True:
        url = (
            "https://earthquake.usgs.gov/fdsnws/event/1/query?"
            f"format=geojson"
            f"&starttime={starttime}"
            f"&endtime={endtime}"
            f"&minmagnitude={MIN_MAGNITUDE}"
            f"&limit={PAGE_LIMIT}"
            f"&offset={offset}"
        )

        features = _get_json(url).get("features", [])
        if not features:
            break

        all_features.extend(features)
        print(f"  Retrieved {len(features)} events (total {len(all_features)})")

        if len(features) < PAGE_LIMIT:
            break

        offset += PAGE_LIMIT

    return all_features


# ----------------- INSERT DATA (into the portal `quakes` table) -----------------
INSERT_SQL = """
    INSERT INTO quakes (source, source_id, geom, magnitude, depth_km, occurred_at, place, raw)
    VALUES (
        %(source)s, %(source_id)s,
        ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography,
        %(magnitude)s, %(depth_km)s, %(occurred_at)s, %(place)s, %(raw)s
    )
    ON CONFLICT (source, source_id) DO NOTHING;
"""


def insert_data(features):
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()

    inserted = 0

    for eq in features:
        props = eq.get("properties") or {}
        coords = (eq.get("geometry") or {}).get("coordinates") or []
        source_id = eq.get("id")
        if not source_id or len(coords) < 2:
            continue  # unusable record, keep going

        time_ms = props.get("time")
        occurred_at = EPOCH + timedelta(milliseconds=time_ms) if time_ms is not None else None
        if occurred_at is None:
            continue  # occurred_at is required

        mag = props.get("mag")
        depth = coords[2] if len(coords) > 2 and coords[2] is not None else None

        row = {
            "source": "usgs",
            "source_id": str(source_id),
            "lon": _normalize_lon(float(coords[0])),
            "lat": float(coords[1]),
            "magnitude": float(mag) if mag is not None else None,
            "depth_km": float(depth) if depth is not None else None,
            "occurred_at": occurred_at,
            "place": props.get("place"),
            "raw": Json(eq),
        }

        cur.execute(INSERT_SQL, row)
        inserted += cur.rowcount  # REAL inserted rows (0 when it already existed)

    conn.commit()
    cur.close()
    conn.close()

    return inserted


# ----------------- CHECKPOINT (resume across restarts) -----------------
def ensure_checkpoint_table():
    conn = psycopg2.connect(**DB)
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS usgs_ingest_checkpoint (
                job text PRIMARY KEY,
                last_year int NOT NULL,
                start_year int,
                end_year int,
                min_magnitude double precision,
                updated_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
    conn.commit()
    conn.close()


def load_last_year():
    """Return the last completed year for this job if the stored run matches the
    current range and magnitude floor, else None."""
    conn = psycopg2.connect(**DB)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT last_year, start_year, end_year, min_magnitude FROM usgs_ingest_checkpoint WHERE job = %s",
            (CHECKPOINT_JOB,),
        )
        row = cur.fetchone()
    conn.close()
    if not row:
        return None
    last_year, s, e, m = row
    if s == START_YEAR and e == END_YEAR and m == MIN_MAGNITUDE:
        return last_year
    return None


def save_last_year(year):
    conn = psycopg2.connect(**DB)
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO usgs_ingest_checkpoint (job, last_year, start_year, end_year, min_magnitude, updated_at)
            VALUES (%s, %s, %s, %s, %s, now())
            ON CONFLICT (job) DO UPDATE SET
                last_year = EXCLUDED.last_year,
                start_year = EXCLUDED.start_year,
                end_year = EXCLUDED.end_year,
                min_magnitude = EXCLUDED.min_magnitude,
                updated_at = now()
            """,
            (CHECKPOINT_JOB, year, START_YEAR, END_YEAR, MIN_MAGNITUDE),
        )
    conn.commit()
    conn.close()


# ----------------- MAIN -----------------
def main():
    print(
        f"Ingesting USGS {START_YEAR}-{END_YEAR}, minmagnitude={MIN_MAGNITUDE} "
        f"into {DB['database']}.quakes @ {DB['host']}:{DB['port']}",
        flush=True,
    )

    ensure_checkpoint_table()

    resume_from = START_YEAR
    if not FRESH:
        last = load_last_year()
        if last is not None and last >= START_YEAR:
            resume_from = last + 1
            print(f"Resuming: {START_YEAR}..{last} already done; starting at {resume_from}", flush=True)

    grand_total = 0

    for year in range(resume_from, END_YEAR + 1):
        # Self-heal transient USGS/network outages (e.g. a brief DNS failure):
        # retry the year a few times with a growing cooldown. If it still fails,
        # stop cleanly; the checkpoint is intact, so a later relaunch resumes here.
        features = None
        for attempt in range(1, MAX_YEAR_ATTEMPTS + 1):
            try:
                features = fetch_year_data(year)
                break
            except RuntimeError as exc:
                if attempt < MAX_YEAR_ATTEMPTS:
                    cooldown = min(300, 60 * attempt)
                    print(
                        f"YEAR {year} fetch failed ({exc}); retry {attempt}/{MAX_YEAR_ATTEMPTS} after {cooldown}s",
                        flush=True,
                    )
                    time.sleep(cooldown)
                else:
                    print(
                        f"YEAR {year} failed after {MAX_YEAR_ATTEMPTS} attempts; stopping. "
                        f"Relaunch to resume from here. Last error: {exc}",
                        flush=True,
                    )
                    return

        inserted = insert_data(features) if features else 0
        grand_total += inserted

        # Mark the year done (even if it had no events) so a restart skips it.
        save_last_year(year)

        print(
            f"YEAR {year}: fetched={len(features)} | "
            f"inserted={inserted} | skipped={len(features) - inserted}",
            flush=True,
        )

    print(f"\nDONE. Total rows inserted: {grand_total}", flush=True)


if __name__ == "__main__":
    main()
