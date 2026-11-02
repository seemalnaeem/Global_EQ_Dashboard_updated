---
name: fastapi-geoproc
description: Build FastAPI geoprocessing endpoints for clustering, density grids, and nearest-fault analytics. Use for spatial compute in geo/.
---

# FastAPI Geoprocessing

## Endpoint pattern
Pydantic request model -> validate -> compute (GeoPandas/Shapely) -> return GeoJSON.
Long jobs run as background tasks or on a worker, not in the request thread.

## Clustering (DBSCAN)
Project points to a metric CRS for the eps distance, cluster, then return results
in 4326. Return cluster id, centroid, count, and max magnitude per cluster.

## Density grid
Bin quakes into a grid or hex layer, count and weight by magnitude, return as a
GeoJSON FeatureCollection the client heat layer can consume. Cache with short TTL.

## Nearest fault
Load tectonic/fault geometries once at startup. Use a spatial index (STRtree) for
nearest lookups. Return distance in meters and the fault id.

## Rules
- Input geometry in 4326. Reproject only for the metric step, store/return 4326.
- Tolerate null magnitude in weighting (treat as unweighted, not zero).
- Pin GeoPandas, Shapely, pyproj. They break across versions.
- Validate output is valid GeoJSON before returning.

## Test (pytest)
Cluster a small fixture, check counts and centroids; feed a null-magnitude row.
