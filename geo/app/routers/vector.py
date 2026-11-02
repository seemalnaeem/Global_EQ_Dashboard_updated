"""Vector import: shells out to ogr2ogr to load a vector file/URL into
PostGIS. Generic and source-agnostic on purpose. POST /vector/import
accepts any user-supplied path/URL; scripts/ingest.py drives the same
core (import_local_file) for the real sources listed in app/manifest.py
(tectonic plate boundaries, fault lines, tectonic points).
"""
import json
import os
import re
import subprocess
import tempfile

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.db import DATABASE_URL, get_connection

router = APIRouter(prefix="/vector", tags=["vector"])

# Raw source vectors mount read-only here (see docker-compose.yml). Falls
# back to /data for local/dev runs outside the compose network.
DATA_DIR = os.environ.get("DATA_DIR", "/data/raw")

# ogr2ogr's -nln target table name is interpolated into a command argv
# element (not a shell string), but we still validate it defensively since
# it also gets used as a SQL identifier when we count rows below.
_TABLE_NAME_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]{0,62}$")


class VectorImportRequest(BaseModel):
    # For real sources (tectonic plates, fault lines, etc.) see
    # app/manifest.py VECTORS and `python -m scripts.ingest`; this endpoint
    # also accepts any ad hoc path/URL.
    path: str = Field(..., description="Path under DATA_DIR, or an http(s) URL")
    table: str = Field(..., description="Target PostGIS table name")
    layer: str | None = Field(default=None, description="Source layer name, if the file has multiple layers")


def _resolve_source(path: str) -> str:
    """Resolve a user-supplied path/URL to a safe OGR source string.
    Remote http(s) URLs stream through GDAL's /vsicurl/ driver rather than
    being fetched by hand. Local paths are confined under DATA_DIR to
    avoid path traversal.
    """
    if path.startswith("http://") or path.startswith("https://"):
        return f"/vsicurl/{path}"

    data_root = os.path.normpath(DATA_DIR)
    abs_path = os.path.normpath(os.path.join(data_root, path.lstrip("/\\")))
    if not (abs_path == data_root or abs_path.startswith(data_root + os.sep)):
        raise HTTPException(status_code=400, detail="path must resolve under DATA_DIR")
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail=f"file not found: {abs_path}")
    return abs_path


@router.post("/import")
def import_vector(req: VectorImportRequest):
    """Import a vector source into PostGIS via ogr2ogr. Reprojects to
    EPSG:4326, promotes to multi-geometry, names the geometry column
    `geom`, and overwrites the target table (re-running with the same
    table name replaces it, keeping the operation repeatable).
    """
    source = _resolve_source(req.path)
    try:
        result = import_local_file(source, req.table, layer=req.layer, source_label=req.path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail=f"ogr2ogr timed out: {exc}")
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return result


def import_local_file(
    source: str,
    table: str,
    layer: str | None = None,
    source_label: str | None = None,
) -> dict:
    """Core ogr2ogr import against an already-resolved local file path,
    /vsicurl/ URL, or temp GeoJSON path. Shared by POST /vector/import
    (arbitrary user-supplied sources) and scripts/ingest.py (manifest-
    driven real sources). Idempotent: `-overwrite` replaces the target
    table on every run.

    Raises ValueError for a bad table name, RuntimeError if ogr2ogr fails.
    """
    if not _TABLE_NAME_RE.match(table):
        raise ValueError(f"invalid table name: {table}")

    # Built as an argv list, never a shell string, so shell metacharacters
    # or spaces in path/table/layer cannot be interpreted by a shell.
    cmd = [
        "ogr2ogr",
        "-f", "PostgreSQL",
        f"PG:{DATABASE_URL}",
        source,
        "-t_srs", "EPSG:4326",
        # Split geometries that cross the antimeridian (long = +/-180) and wrap
        # any out-of-range longitudes back into -180..180. A no-op for data
        # already within range; prevents polygons/lines from stretching across
        # the whole map when a source was digitized with continuous longitudes.
        "-wrapdateline",
        "-datelineoffset", "10",
        "-nlt", "PROMOTE_TO_MULTI",
        "-lco", "GEOMETRY_NAME=geom",
        "-lco", "SPATIAL_INDEX=GIST",
        # Store Real fields as float8 and strings without a length cap. Without
        # this, ogr2ogr maps a shapefile's declared width/precision to
        # numeric(w,p), which overflows on fields like District shape_area
        # (9 integer digits into a numeric that allows 8).
        "-lco", "PRECISION=NO",
        "-nln", table,
        "-overwrite",
    ]
    if layer:
        cmd.append(layer)

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"ogr2ogr failed for {table}: {result.stderr.strip()}")

    feature_count = _count_rows(table)
    _record_import(
        name=table, kind="vector", source_path=source_label or source, srid=4326, feature_count=feature_count
    )

    return {
        "table": table,
        "srid": 4326,
        "feature_count": feature_count,
        "stderr": result.stderr.strip() or None,
    }


def extract_geojson_from_js(js_path: str) -> str:
    """Extract embedded GeoJSON from a `window.EQ_DATA[...] = {...};` JS
    wrapper (e.g. global-tectonic-points.js, which has no bare .json
    twin). Starts at the GeoJSON object (the first `{"type"...`) rather than
    the first '{', because the wrapper's own `window.EQ_DATA || {}` guard puts
    an empty object earlier in the file. Slices to the last '}', validates the
    slice parses as JSON, and writes it to a temp .geojson file ogr2ogr reads
    directly. Caller is responsible for deleting the temp file.
    """
    with open(js_path, "r", encoding="utf-8") as f:
        text = f.read()

    match = re.search(r'\{\s*"type"', text)
    start = match.start() if match else text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError(f"no JSON object found in {js_path}")

    payload = text[start : end + 1]
    json.loads(payload)  # fail fast if the slice is not valid JSON

    fd, tmp_path = tempfile.mkstemp(suffix=".geojson", prefix="vector_js_")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(payload)
    return tmp_path


def _count_rows(table: str) -> int | None:
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # table already validated against _TABLE_NAME_RE above.
                cur.execute(f'SELECT count(*) FROM "{table}"')
                row = cur.fetchone()
                return row[0] if row else None
    except Exception:
        return None


def _record_import(name: str, kind: str, source_path: str, srid: int, feature_count: int | None) -> None:
    """Upsert the import record in imported_layers (table owned by the db
    agent, see db/init/02_schema.sql; no unique constraint on `name`, so
    the upsert is done here as update-then-insert-if-missing rather than
    ON CONFLICT). Re-running an import updates the existing row for
    (name, kind) instead of accumulating duplicates. Best-effort: the
    ogr2ogr/COG write already succeeded, so a bookkeeping failure here
    should not fail the request.
    """
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE imported_layers
                    SET source_path = %s, srid = %s, feature_count = %s, imported_at = now()
                    WHERE name = %s AND kind = %s
                    """,
                    (source_path, srid, feature_count, name, kind),
                )
                if cur.rowcount == 0:
                    cur.execute(
                        """
                        INSERT INTO imported_layers (name, kind, source_path, srid, feature_count)
                        VALUES (%s, %s, %s, %s, %s)
                        """,
                        (name, kind, source_path, srid, feature_count),
                    )
            conn.commit()
    except Exception:
        pass
