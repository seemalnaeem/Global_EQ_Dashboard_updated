"""Historical USGS backfill: ingest every earthquake in a date range from the
USGS FDSNWS event query API into the `quakes` table, with resumable progress.

Why this exists
---------------
The live ingest (app/routers/quakes.py) only reads the USGS *summary* feeds
(hour/day/week/month), so it cannot reach far back. This script uses the FDSNWS
*query* endpoint (https://earthquake.usgs.gov/fdsnws/event/1/query), which
accepts an arbitrary starttime/endtime.

How it works (the algorithm)
----------------------------
1. Time-window walk. The range is processed as half-open [start, end) windows on
   a stack, always splitting the later half under the earlier one, so windows
   complete in strict chronological order (1900 -> 2026).
2. Split-before-count. FDSNWS caps a single response at 20,000 events, and its
   `count` endpoint builds a server-side temp table that OVERFLOWS (HTTP 503,
   "temp table is full") if you count a range as huge as the whole century. So a
   window wider than MAX_COUNT_SPAN is split blindly by time first (no HTTP);
   only windows small enough to count safely are counted.
3. Count-then-fetch. For a countable window: ask `count`. If 0, skip. If it is
   over the 20,000 page limit, split it in half and recurse. Otherwise fetch the
   GeoJSON and upsert it.
4. Same normalization as the live feed. Rows go through `_parse_feature` and
   `upsert_quakes`, so `ON CONFLICT (source, source_id)` makes the whole run
   idempotent: re-running never duplicates, it just refreshes.
5. Resilient. A window whose USGS calls exhaust their retries is cooled down and
   requeued (up to MAX_WINDOW_ATTEMPTS), then recorded as skipped and left for a
   later run, so a transient USGS outage never aborts the whole job.
6. Resumable (checkpointing). Because windows finish in chronological order, the
   end of the last completed window is a high-water mark: everything before it is
   done. That mark, plus any skipped windows, is saved to a `backfill_checkpoint`
   row in the same Postgres DB after every few windows. On restart the job reads
   it and resumes from the high-water mark, and re-queues the skipped windows to
   retry them. Pass --fresh to ignore the checkpoint and start over.

Run inside the geo container (DATABASE_URL and deps are already set there):

    docker compose exec -d geo sh -c \
      'python -m scripts.backfill_usgs --start 1900-01-01 --end 2026-08-27 > /tmp/backfill.log 2>&1'

Defaults cover 1900-01-01 through 2026-08-27 (inclusive), no magnitude floor.
With no magnitude floor this is millions of events and runs for hours.
"""
import argparse
import logging
import time
from datetime import datetime, timedelta, timezone

import requests
from psycopg.types.json import Json

from app.db import get_connection
from app.routers.quakes import _parse_feature, upsert_quakes

logger = logging.getLogger("backfill_usgs")

FDSNWS_BASE = "https://earthquake.usgs.gov/fdsnws/event/1"
# FDSNWS rejects a query whose match count exceeds this with HTTP 400, so we
# keep every fetched window at or under it.
PAGE_LIMIT = 20000
HTTP_TIMEOUT = 120
USER_AGENT = "global-eq-dashboard-backfill/1.0 (historical USGS ingest)"
# Do not split a window below this span. If one this small still holds more than
# PAGE_LIMIT events (a huge dense swarm), we fetch its first page and warn rather
# than recurse forever.
MIN_WINDOW = timedelta(minutes=1)
# USGS builds a server-side temp table to answer a `count`, and a count over a
# very large range (e.g. the whole 1900..2026 span) overflows it and returns
# HTTP 503 ("temp table is full"). So never count a window wider than this;
# split anything larger blindly by time first, then count the small pieces.
MAX_COUNT_SPAN = timedelta(days=30)
# How many times to retry a single window (with a growing cooldown) before
# recording it as skipped and moving on, so a stubborn USGS outage on one window
# never kills the whole multi-hour run.
MAX_WINDOW_ATTEMPTS = 6
# Default job name for the checkpoint row (one resumable job at a time).
CHECKPOINT_JOB = "usgs_backfill"


def _iso(dt: datetime) -> str:
    """FDSNWS-friendly UTC timestamp (no timezone suffix, which it treats as UTC)."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def _from_iso(text: str) -> datetime:
    """Inverse of _iso: parse a stored checkpoint timestamp back to UTC-aware."""
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)


def _get(path: str, params: dict) -> requests.Response | None:
    """GET a FDSNWS endpoint with retry/backoff on 429, 5xx, and network errors.
    Returns the response, or None if the server reports "no data" (HTTP 204).
    Raises RuntimeError once retries are exhausted.
    """
    url = f"{FDSNWS_BASE}/{path}"
    headers = {"User-Agent": USER_AGENT}
    last_exc: Exception | None = None
    # USGS throttles with 503/429 under load, so back off generously before
    # giving up. The caller (backfill) adds a further cooldown-and-requeue on
    # top of this, so an exhausted window never aborts the whole run.
    for wait_s in [0, 5, 15, 30, 60, 120]:
        if wait_s:
            time.sleep(wait_s)
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=HTTP_TIMEOUT)
            if resp.status_code == 204:
                return None  # FDSNWS: request valid but nothing matched
            if resp.status_code == 429 or resp.status_code >= 500:
                last_exc = RuntimeError(f"{path}: HTTP {resp.status_code}")
                continue
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            last_exc = exc
            continue
    raise RuntimeError(f"FDSNWS {path} unreachable after retries: {last_exc}")


def count_events(start: datetime, end: datetime, min_magnitude: float | None) -> int:
    """How many events FDSNWS holds in [start, end). Cheap: it returns just a
    number, so we use it to decide whether a window needs splitting."""
    params = {"format": "text", "starttime": _iso(start), "endtime": _iso(end)}
    if min_magnitude is not None:
        params["minmagnitude"] = min_magnitude
    resp = _get("count", params)
    if resp is None:
        return 0
    text = resp.text.strip()
    return int(text) if text else 0


def fetch_events(start: datetime, end: datetime, min_magnitude: float | None, limit: int | None = None) -> list[dict]:
    """Fetch and normalize events in [start, end). Truncation is avoided by the
    caller keeping counts under PAGE_LIMIT; `limit` is only used for the rare
    below-MIN_WINDOW fallback."""
    params = {
        "format": "geojson",
        "starttime": _iso(start),
        "endtime": _iso(end),
        "orderby": "time-asc",
    }
    if min_magnitude is not None:
        params["minmagnitude"] = min_magnitude
    if limit is not None:
        params["limit"] = limit
    resp = _get("query", params)
    if resp is None:
        return []
    payload = resp.json()
    rows: list[dict] = []
    for feature in payload.get("features") or []:
        row = _parse_feature(feature)
        if row is not None:
            rows.append(row)
    return rows


# ---------- checkpoint (resume across restarts) ----------

def ensure_checkpoint_table() -> None:
    """Create the checkpoint table if missing. Self-provisioning so no migration
    file is needed; the row lives in the same DB as `quakes` (db_data volume),
    so it survives container restarts."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS backfill_checkpoint (
                    job text PRIMARY KEY,
                    resume_at timestamptz NOT NULL,
                    skipped jsonb NOT NULL DEFAULT '[]'::jsonb,
                    start_at timestamptz,
                    end_at timestamptz,
                    min_magnitude double precision,
                    updated_at timestamptz NOT NULL DEFAULT now()
                )
                """
            )
        conn.commit()


def load_checkpoint(job: str) -> dict | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT resume_at, skipped, end_at, min_magnitude FROM backfill_checkpoint WHERE job = %s",
                (job,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return {"resume_at": row[0], "skipped": row[1] or [], "end_at": row[2], "min_magnitude": row[3]}


def save_checkpoint(job, resume_at, skipped, start_at, end_at, min_magnitude) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO backfill_checkpoint (job, resume_at, skipped, start_at, end_at, min_magnitude, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, now())
                ON CONFLICT (job) DO UPDATE SET
                    resume_at = EXCLUDED.resume_at,
                    skipped = EXCLUDED.skipped,
                    start_at = EXCLUDED.start_at,
                    end_at = EXCLUDED.end_at,
                    min_magnitude = EXCLUDED.min_magnitude,
                    updated_at = now()
                """,
                (job, resume_at, Json(skipped), start_at, end_at, min_magnitude),
            )
        conn.commit()


def backfill(
    start: datetime,
    end: datetime,
    min_magnitude: float | None,
    sleep_s: float,
    job: str,
    seed_skipped: list[tuple[datetime, datetime]],
    checkpoint_every: int,
) -> dict:
    """Walk [start, end) with adaptive time-window splitting, saving a resume
    checkpoint as it goes. `seed_skipped` re-queues windows a previous run gave
    up on so they get another try. Returns run totals."""
    # A stack of [s, e, attempts) windows. The forward range sits on top so it is
    # processed first; any re-queued skipped windows sit under it. Splitting keeps
    # the earlier half on top, so the forward scan stays chronological.
    stack: list[tuple[datetime, datetime, int]] = []
    for s, e in seed_skipped:
        stack.append((s, e, 0))
    stack.append((start, end, 0))

    totals = {"windows": 0, "fetched": 0, "upserted": 0, "skipped": 0}
    # High-water mark: end of the furthest completed window. Everything before it
    # is done. Monotonic (max), so re-tried older windows never drag it back.
    resume_at = start
    skipped: set[tuple[str, str]] = {(_iso(s), _iso(e)) for s, e in seed_skipped}

    def persist() -> None:
        save_checkpoint(job, resume_at, [list(p) for p in sorted(skipped)], start, end, min_magnitude)

    while stack:
        s, e, attempts = stack.pop()
        if s >= e:
            continue

        # A range wider than USGS can count in one go: split blindly by time
        # (no HTTP) until the pieces are small enough to count safely.
        if (e - s) > MAX_COUNT_SPAN:
            mid = s + (e - s) / 2
            stack.append((mid, e, 0))
            stack.append((s, mid, 0))
            continue

        try:
            n = count_events(s, e, min_magnitude)
            time.sleep(sleep_s)
            if n == 0:
                resume_at = max(resume_at, e)
                continue

            if n > PAGE_LIMIT and (e - s) > MIN_WINDOW:
                mid = s + (e - s) / 2
                stack.append((mid, e, 0))
                stack.append((s, mid, 0))
                continue

            if n > PAGE_LIMIT:
                logger.warning(
                    "dense window %s..%s holds %d events (> %d) at min span; fetching first %d only",
                    _iso(s), _iso(e), n, PAGE_LIMIT, PAGE_LIMIT,
                )
                rows = fetch_events(s, e, min_magnitude, limit=PAGE_LIMIT)
            else:
                rows = fetch_events(s, e, min_magnitude)

            written = upsert_quakes(rows)
            totals["windows"] += 1
            totals["fetched"] += len(rows)
            totals["upserted"] += written
            resume_at = max(resume_at, e)
            skipped.discard((_iso(s), _iso(e)))  # a previously-skipped window succeeded
            logger.info(
                "%s..%s  count=%d fetched=%d  (cumulative upserted=%d)",
                _iso(s), _iso(e), n, len(rows), totals["upserted"],
            )
            if totals["windows"] % checkpoint_every == 0:
                persist()
            time.sleep(sleep_s)
        except RuntimeError as exc:
            if attempts + 1 < MAX_WINDOW_ATTEMPTS:
                cooldown = min(300, 30 * (attempts + 1))
                logger.warning(
                    "window %s..%s failed (%s); cooldown %ds then retry %d/%d",
                    _iso(s), _iso(e), exc, cooldown, attempts + 1, MAX_WINDOW_ATTEMPTS,
                )
                time.sleep(cooldown)
                stack.append((s, e, attempts + 1))
            else:
                totals["skipped"] += 1
                skipped.add((_iso(s), _iso(e)))
                persist()
                logger.error(
                    "window %s..%s skipped after %d attempts: %s",
                    _iso(s), _iso(e), MAX_WINDOW_ATTEMPTS, exc,
                )

    persist()
    return totals


def _parse_date(value: str) -> datetime:
    """Accept YYYY-MM-DD (ISO) or MM/DD/YYYY. Returns a UTC midnight datetime."""
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    raise argparse.ArgumentTypeError(f"unrecognized date {value!r}; use YYYY-MM-DD or MM/DD/YYYY")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill historical USGS earthquakes into PostGIS.")
    parser.add_argument("--start", type=_parse_date, default=_parse_date("1900-01-01"),
                        help="inclusive start date (YYYY-MM-DD or MM/DD/YYYY), default 1900-01-01")
    parser.add_argument("--end", type=_parse_date, default=_parse_date("2026-08-27"),
                        help="inclusive end date (YYYY-MM-DD or MM/DD/YYYY), default 2026-08-27")
    parser.add_argument("--min-magnitude", type=float, default=None,
                        help="optional magnitude floor; omit to ingest every event")
    parser.add_argument("--sleep", type=float, default=0.3,
                        help="seconds to pause between USGS requests (be polite), default 0.3")
    parser.add_argument("--job", default=CHECKPOINT_JOB,
                        help=f"checkpoint job name, default {CHECKPOINT_JOB}")
    parser.add_argument("--checkpoint-every", type=int, default=25,
                        help="save the resume checkpoint every N completed windows, default 25")
    parser.add_argument("--fresh", action="store_true",
                        help="ignore any existing checkpoint and start from --start")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    # End is inclusive of the given day: query up to the start of the next day.
    end_exclusive = args.end + timedelta(days=1)
    if args.start >= end_exclusive:
        parser.error("start date must be before end date")

    ensure_checkpoint_table()

    effective_start = args.start
    seed_skipped: list[tuple[datetime, datetime]] = []
    if not args.fresh:
        cp = load_checkpoint(args.job)
        # Only resume a checkpoint that matches this job's range and magnitude
        # floor, otherwise it describes a different run.
        same_job = (
            cp is not None
            and cp["end_at"] == end_exclusive
            and cp["min_magnitude"] == args.min_magnitude
            and args.start <= cp["resume_at"] <= end_exclusive
        )
        if same_job:
            effective_start = cp["resume_at"]
            seed_skipped = [(_from_iso(a), _from_iso(b)) for a, b in cp["skipped"]]
            logger.info(
                "resuming job %r from %s (%d skipped window(s) to retry)",
                args.job, _iso(effective_start), len(seed_skipped),
            )
        elif cp is not None:
            logger.info("existing checkpoint for %r does not match this range; starting fresh", args.job)

    logger.info(
        "backfill USGS %s .. %s (inclusive)%s",
        _iso(effective_start), _iso(args.end),
        f", minmagnitude={args.min_magnitude}" if args.min_magnitude is not None else "",
    )
    started = time.monotonic()
    totals = backfill(
        effective_start, end_exclusive, args.min_magnitude, args.sleep,
        args.job, seed_skipped, args.checkpoint_every,
    )
    elapsed = time.monotonic() - started
    logger.info(
        "done: %d windows, %d fetched, %d upserted, %d skipped in %.0fs",
        totals["windows"], totals["fetched"], totals["upserted"], totals["skipped"], elapsed,
    )


if __name__ == "__main__":
    main()
