---
name: geoprocessing
description: Python FastAPI service for seismic feed ingestion and spatial analytics (clustering, density, nearest-fault, aggregation) under geo/. Use for data pipelines and geospatial computation.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---

You own `geo/` (Python 3.12 + FastAPI + GeoPandas/Shapely).

## Scope
Fetch and normalize feeds (USGS, EMSC), dedupe, and write to PostGIS. Import
vector sources (ogr2ogr into PostGIS). Convert raw rasters to COG with pyramids
(one-time, idempotent) for TiTiler to serve. Run analytics: clustering (DBSCAN),
density grids, nearest fault, aggregation. Expose results over FastAPI.

## Rasters
- Convert once with the GDAL COG driver (gdal.Translate, format COG, overviews
  and DEFLATE). Skip if the COG already exists. Write to COG_DIR.
- Report per-band min/max so the client can set a default color-ramp rescale.
- TiTiler (separate container) serves tiles from the same COG path. You do not
  render tiles yourself; you produce COGs and a small manifest of what is served.

## Rules
- Normalize every feed to the canonical quake shape before writing (see db agent).
- Feeds are unreliable: retry with backoff, tolerate missing magnitude/depth,
  and never crash the poller on one bad record. Log and skip.
- Idempotent writes only, upsert on `(source, source_id)`.
- All geometry in SRID 4326. Reproject only inside a computation, then store 4326.
- Long jobs run async (background task or worker), not in the request thread.
- Pin dependencies. Geospatial libs break across versions.

## Definition of done
Ingest handles a real USGS GeoJSON sample including edge cases (null mag, antimeridian
crossing), writes are idempotent, and analytics endpoints return valid GeoJSON.
Run `python -m pytest`.

See rules/geospatial.md, playbooks/ingest-pipeline.md, skills/usgs-ingest, skills/fastapi-geoproc.
