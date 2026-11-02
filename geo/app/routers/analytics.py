"""Analytics endpoints. Stubs for now, real quake data is supplied later.
Implementation must follow skills/fastapi-geoproc: Pydantic request ->
validate -> compute (GeoPandas/Shapely, reproject to a metric CRS only for
the compute step) -> return valid GeoJSON in EPSG:4326. Long jobs run as
background tasks or on a worker, not inline in the request thread.
"""
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.post("/clusters")
def clusters():
    """DBSCAN clustering of quake points. Project to a metric CRS for the
    eps distance, cluster, return cluster id, centroid, count, and max
    magnitude per cluster in EPSG:4326. See skills/fastapi-geoproc.
    """
    raise HTTPException(
        status_code=501,
        detail=(
            "not implemented: DBSCAN clustering awaits a real quake data source. "
            "See skills/fastapi-geoproc for the intended implementation."
        ),
    )


@router.post("/density")
def density():
    """Density/heat grid. Bin quakes into a grid or hex layer, count and
    weight by magnitude (null magnitude treated as unweighted, not zero),
    return a GeoJSON FeatureCollection, cache with a short TTL. See
    skills/fastapi-geoproc.
    """
    raise HTTPException(
        status_code=501,
        detail=(
            "not implemented: density grid awaits a real quake data source. "
            "See skills/fastapi-geoproc for the intended implementation."
        ),
    )
