"""Raster endpoints backed directly by osgeo.gdal (no rasterio, see
requirements.txt for why). POST /raster/process converts a raw raster to
a Cloud-Optimized GeoTIFF (COG) under COG_DIR, idempotently, and records it
in a manifest.json catalog that TiTiler and the client read from. Real
raster sources (LS/PGA hazard maps) are listed in app/manifest.py RASTERS
and driven by scripts/ingest.py; this router exposes the same core
(process_raster_file) over HTTP for ad hoc use.
"""
import json
import os
import re

from fastapi import APIRouter, HTTPException
from osgeo import gdal, osr
from pydantic import BaseModel, Field

from app.db import get_connection

router = APIRouter(prefix="/raster", tags=["raster"])

# Raw source rasters mount read-only here (see docker-compose.yml). Falls
# back to /data for local/dev runs outside the compose network.
DATA_DIR = os.environ.get("DATA_DIR", "/data/raw")
# COGs are written here; titiler mounts the same path read-only so
# url=/data/cogs/<name>.tif resolves in both containers.
COG_DIR = os.environ.get("COG_DIR", "/data/cogs")

_NAME_RE = re.compile(r"^[a-zA-Z0-9_-]{1,80}$")

gdal.UseExceptions()


class RasterInfoRequest(BaseModel):
    path: str = Field(..., description="Path under DATA_DIR")


class RasterReprojectRequest(BaseModel):
    path: str = Field(..., description="Source path under DATA_DIR")
    out_path: str = Field(..., description="Destination path under DATA_DIR")


class RasterProcessRequest(BaseModel):
    path: str = Field(..., description="Source raster path under DATA_DIR")
    name: str = Field(..., description="Output COG name (no extension); also the catalog key")
    title: str | None = Field(default=None, description="Human-readable title, defaults to name")
    categorical: bool = Field(default=False, description="True if values are class codes (has a VAT), not continuous")


def _resolve_local(path: str) -> str:
    data_root = os.path.normpath(DATA_DIR)
    abs_path = os.path.normpath(os.path.join(data_root, path.lstrip("/\\")))
    if not (abs_path == data_root or abs_path.startswith(data_root + os.sep)):
        raise HTTPException(status_code=400, detail="path must resolve under DATA_DIR")
    return abs_path


@router.post("/info")
def raster_info(req: RasterInfoRequest):
    """Summarize a raster: pixel size, band count, CRS, and bounds.
    Equivalent to `gdalinfo`, but via the Python bindings so it stays
    in-process (no subprocess needed for this one).
    """
    path = _resolve_local(req.path)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"file not found: {path}")

    try:
        ds = gdal.Open(path)
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=f"GDAL could not open: {exc}")

    gt = ds.GetGeoTransform()
    width, height = ds.RasterXSize, ds.RasterYSize
    minx = gt[0]
    maxy = gt[3]
    maxx = minx + gt[1] * width
    miny = maxy + gt[5] * height

    srs = osr.SpatialReference()
    srs.ImportFromWkt(ds.GetProjection() or "")
    epsg = None
    if ds.GetProjection():
        epsg = srs.GetAuthorityCode(None)

    return {
        "path": req.path,
        "size": {"width": width, "height": height},
        "band_count": ds.RasterCount,
        "crs": f"EPSG:{epsg}" if epsg else (ds.GetProjection() or None),
        "bounds": {"minx": minx, "miny": miny, "maxx": maxx, "maxy": maxy},
    }


@router.post("/reproject")
def raster_reproject(req: RasterReprojectRequest):
    """Reproject a raster to EPSG:4326 via gdal.Warp, writing the result
    under DATA_DIR. See rules/geospatial.md: store 4326, reproject only
    inside a computation.
    """
    src_path = _resolve_local(req.path)
    dst_path = _resolve_local(req.out_path)
    if not os.path.exists(src_path):
        raise HTTPException(status_code=404, detail=f"file not found: {src_path}")

    try:
        out_ds = gdal.Warp(dst_path, src_path, dstSRS="EPSG:4326")
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=f"gdal.Warp failed: {exc}")

    if out_ds is None:
        raise HTTPException(status_code=422, detail="gdal.Warp returned no output dataset")
    out_ds = None  # flush/close

    return {"out_path": req.out_path, "srid": 4326}


@router.post("/process")
def raster_process(req: RasterProcessRequest):
    """Convert a raw raster to a COG under COG_DIR (skip if it already
    exists), compute per-band min/max, and upsert the catalog entry into
    manifest.json. Returns the catalog entry.
    """
    if not _NAME_RE.match(req.name):
        raise HTTPException(status_code=400, detail="invalid name: use letters, digits, _ or -")

    src_path = _resolve_local(req.path)
    if not os.path.exists(src_path):
        raise HTTPException(status_code=404, detail=f"file not found: {src_path}")

    try:
        entry = process_raster_file(src_path, req.name, title=req.title, categorical=req.categorical)
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    return entry


@router.get("/catalog")
def raster_catalog():
    """Full COG catalog, read from manifest.json. Empty list if nothing
    has been processed yet."""
    return _load_manifest()


def process_raster_file(src_path: str, name: str, title: str | None = None, categorical: bool = False) -> dict:
    """Core COG conversion, shared by POST /raster/process (ad hoc use)
    and scripts/ingest.py (manifest-driven real sources). Idempotent: the
    gdal.Translate step is skipped if COG_DIR/<name>.tif already exists,
    but stats are (re)computed and the manifest entry is always upserted
    so a partial prior run is repaired on re-run.
    """
    os.makedirs(COG_DIR, exist_ok=True)
    out_path = os.path.join(COG_DIR, f"{name}.tif")

    if not os.path.exists(out_path):
        try:
            src_ds = gdal.Open(src_path)
        except RuntimeError as exc:
            raise RuntimeError(f"GDAL could not open {src_path}: {exc}")
        if src_ds is None:
            raise RuntimeError(f"GDAL could not open {src_path}")

        try:
            out_ds = gdal.Translate(
                out_path,
                src_ds,
                format="COG",
                creationOptions=["COMPRESS=DEFLATE", "OVERVIEW_RESAMPLING=NEAREST", "BLOCKSIZE=512"],
            )
        except RuntimeError as exc:
            raise RuntimeError(f"gdal.Translate (COG) failed for {name}: {exc}")
        finally:
            src_ds = None
        if out_ds is None:
            raise RuntimeError(f"gdal.Translate (COG) returned no output dataset for {name}")
        out_ds = None  # flush/close

    try:
        cog_ds = gdal.Open(out_path)
    except RuntimeError as exc:
        raise RuntimeError(f"GDAL could not open generated COG {out_path}: {exc}")

    band_count = cog_ds.RasterCount
    mins: list[float] = []
    maxs: list[float] = []
    for band_index in range(1, band_count + 1):
        band = cog_ds.GetRasterBand(band_index)
        band_min, band_max, _mean, _stddev = band.ComputeStatistics(False)
        mins.append(band_min)
        maxs.append(band_max)

    srs = osr.SpatialReference()
    srs.ImportFromWkt(cog_ds.GetProjection() or "")
    epsg = srs.GetAuthorityCode(None) if cog_ds.GetProjection() else None
    srid = int(epsg) if epsg else None
    cog_ds = None

    entry = {
        "name": name,
        "title": title or name,
        "cog_path": f"{COG_DIR}/{name}.tif".replace(os.sep, "/"),
        "tiles_endpoint": "/tiles/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png",
        "bands": band_count,
        "min": mins,
        "max": maxs,
        "colormap_default": "viridis",
        "categorical": categorical,
    }
    _update_manifest(entry)
    _record_raster_import(name=name, source_path=src_path, srid=srid)
    return entry


def _manifest_path() -> str:
    return os.path.join(COG_DIR, "manifest.json")


def _load_manifest() -> dict:
    path = _manifest_path()
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"rasters": []}


def _update_manifest(entry: dict) -> None:
    """Upsert `entry` into manifest.json by name, written atomically
    (write to a temp file, then os.replace) so a concurrent GET /catalog
    never sees a half-written file."""
    manifest = _load_manifest()
    rasters = [r for r in manifest.get("rasters", []) if r.get("name") != entry["name"]]
    rasters.append(entry)
    rasters.sort(key=lambda r: r["name"])
    manifest["rasters"] = rasters

    os.makedirs(COG_DIR, exist_ok=True)
    path = _manifest_path()
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    os.replace(tmp_path, path)


def _record_raster_import(name: str, source_path: str, srid: int | None) -> None:
    """Upsert into imported_layers (kind='raster'), mirroring
    app/routers/vector.py's _record_import. Best-effort: the COG already
    exists on disk, so a bookkeeping failure here should not fail the
    request. feature_count is left null (rasters have none); srid is read
    off the generated COG itself, not assumed.
    """
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE imported_layers
                    SET source_path = %s, srid = %s, imported_at = now()
                    WHERE name = %s AND kind = 'raster'
                    """,
                    (source_path, srid, name),
                )
                if cur.rowcount == 0:
                    cur.execute(
                        """
                        INSERT INTO imported_layers (name, kind, source_path, srid)
                        VALUES (%s, 'raster', %s, %s)
                        """,
                        (name, source_path, srid),
                    )
            conn.commit()
    except Exception:
        pass
