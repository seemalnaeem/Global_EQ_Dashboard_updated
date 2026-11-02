"""Geoprocessing service entrypoint. Binds 0.0.0.0:3091, backend port range
3090-3099 (see docker-compose.yml). Health, tool-info, and router
registration happen here. The USGS poll loop is the one exception to "no
data fetched on startup": it runs as a background asyncio task so the feed
stays current without a separate cron/worker (see rules/geospatial.md,
"Long jobs run async").
"""
import asyncio
import logging
import os
import shutil
import subprocess
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from osgeo import gdal

from app.db import is_reachable
from app.routers import analytics, quakes, raster, vector

logger = logging.getLogger("geo.main")

POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL", "60"))

# Module-level status read by GET /quakes/status (app/routers/quakes.py).
# Plain dict, single poll loop writes it, no lock needed (GIL covers this).
poll_status: dict = {
    "last_poll_at": None,
    "last_error": None,
    "last_upserted": None,
}

_poll_task: asyncio.Task | None = None


async def _poll_loop() -> None:
    """Fetch+upsert forever, tolerating any single failure. Backs off on
    repeated consecutive failures (capped) so a persistent outage does not
    hammer the feed, but the schedule itself never stops.
    """
    consecutive_failures = 0
    while True:
        try:
            result = await asyncio.to_thread(quakes.run_ingest_once)
            poll_status["last_poll_at"] = datetime.now(timezone.utc).isoformat()
            poll_status["last_error"] = None
            poll_status["last_upserted"] = result["upserted"]
            consecutive_failures = 0
            logger.info(
                "usgs poll ok: fetched=%s upserted=%s feed=%s",
                result["fetched"], result["upserted"], result["feed"],
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            consecutive_failures += 1
            poll_status["last_poll_at"] = datetime.now(timezone.utc).isoformat()
            poll_status["last_error"] = str(exc)
            logger.warning("usgs poll failed (%s consecutive): %s", consecutive_failures, exc)

        # Backoff on repeated failure: double the interval up to 10x, on
        # top of the normal schedule. Success resets it via the counter above.
        sleep_for = POLL_INTERVAL * min(2 ** min(consecutive_failures, 4), 10) if consecutive_failures else POLL_INTERVAL
        try:
            await asyncio.sleep(sleep_for)
        except asyncio.CancelledError:
            raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _poll_task
    _poll_task = asyncio.create_task(_poll_loop())
    try:
        yield
    finally:
        if _poll_task:
            _poll_task.cancel()
            try:
                await _poll_task
            except asyncio.CancelledError:
                pass


app = FastAPI(title="Global EQ Dashboard - Geo Service", lifespan=lifespan)

app.include_router(vector.router)
app.include_router(raster.router)
app.include_router(analytics.router)
app.include_router(quakes.router)


@app.get("/health")
def health():
    return {"status": "ok", "db": is_reachable()}


@app.get("/tools")
def tools():
    """Proves the GDAL/OGR/PROJ toolchain from the base image is present
    and importable/callable inside the running container."""
    ogr2ogr_path = shutil.which("ogr2ogr")
    ogr2ogr_version = None
    if ogr2ogr_path:
        try:
            result = subprocess.run(
                [ogr2ogr_path, "--version"],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            ogr2ogr_version = (result.stdout or result.stderr).strip() or None
        except Exception as exc:
            ogr2ogr_version = f"error: {exc}"

    try:
        from pyproj import proj_version_str

        proj_version = proj_version_str
    except Exception as exc:
        proj_version = f"error: {exc}"

    return {
        "gdal": gdal.__version__,
        "ogr2ogr": ogr2ogr_version,
        "proj": proj_version,
    }
