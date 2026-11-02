# geo service

FastAPI geoprocessing service. Binds 0.0.0.0:3091 inside the container,
published as host port 3091 (backend range 3090-3099, see docker-compose.yml).

## Toolchain

Base image `ghcr.io/osgeo/gdal:ubuntu-small-latest` ships:
- GDAL/OGR CLIs: `ogr2ogr`, `gdalinfo`, `gdal_translate`, etc.
- GDAL's own Python bindings (`osgeo.gdal`, `osgeo.ogr`, `osgeo.osr`), built
  against the same GDAL as the CLIs, so there is no version mismatch.
- PROJ, for coordinate transforms.

Python deps (see requirements.txt) add FastAPI/uvicorn, psycopg, and the
GeoPandas/Shapely/pyproj/Fiona stack for vector analytics. `rasterio` is
intentionally excluded, raster work goes through `osgeo.gdal` directly to
avoid a second, conflicting GDAL build in the image.

Check `GET /tools` to confirm GDAL, ogr2ogr, and PROJ versions at runtime.

## Endpoints

- `GET /health` - `{status, db}`, db is a live reachability check against
  DATABASE_URL.
- `GET /tools` - GDAL/ogr2ogr/PROJ versions.
- `POST /vector/import` - `{path, table, layer?}`, runs ogr2ogr into
  PostGIS (EPSG:4326, `-nlt PROMOTE_TO_MULTI`, geometry column `geom`,
  GIST spatial index, `-overwrite`), upserts the load into `imported_layers`.
- `POST /raster/info` - `{path}`, returns size, band count, CRS, bounds via
  `osgeo.gdal`.
- `POST /raster/reproject` - `{path, out_path}`, reprojects to EPSG:4326
  via `gdal.Warp`.
- `POST /raster/process` - `{path, name, title?, categorical?}`, converts a
  raw raster to a COG at `COG_DIR/<name>.tif` (GDAL COG driver, DEFLATE,
  512 blocksize), skipped if the COG already exists. Computes per-band
  min/max and upserts the catalog entry into `COG_DIR/manifest.json` and
  `imported_layers` (kind='raster'). Returns the catalog entry.
- `GET /raster/catalog` - `{rasters: [entry, ...]}`, read straight from
  manifest.json. Entry shape:
  ```json
  {
    "name": "pga_hazard_world",
    "title": "PGA Hazard World",
    "cog_path": "/data/cogs/pga_hazard_world.tif",
    "tiles_endpoint": "/tiles/cog/tiles/{z}/{x}/{y}.png",
    "bands": 1,
    "min": [0.0],
    "max": [1.2],
    "colormap_default": "viridis",
    "categorical": true
  }
  ```
  `tiles_endpoint` is a template; the client fills `{z}/{x}/{y}` and adds
  `?url=<cog_path>&colormap_name=...&rescale=min,max` (see
  skills/raster-tiles). `cog_path` is the same path in geo and titiler
  (both mount the `cog_data` volume at `/data/cogs`), so `url=` resolves
  in both containers.
- `POST /analytics/clusters`, `POST /analytics/density` - 501 stubs. See
  skills/fastapi-geoproc for the intended DBSCAN/density-grid design.
- `POST /quakes/ingest` - `{feed?}`, runs one USGS fetch+upsert now (feed
  level defaults to `USGS_FEED`). Returns `{fetched, upserted, feed}`.
- `GET /quakes/status` - `{last_poll_at, last_error, last_upserted,
  total_usgs}` from the background poll loop plus a live row count.

## USGS poll loop

`app/main.py` starts a background asyncio task on startup (FastAPI
`lifespan`) that fetches the USGS summary feed and upserts into `quakes`
forever, sleeping `POLL_INTERVAL` seconds between runs; the fetch+DB work
runs via `asyncio.to_thread` so it never blocks the event loop. One poll
runs immediately on startup. A single bad feature or a feed failure is
logged and skipped, never crashes the loop; consecutive failures back off
(up to 10x `POLL_INTERVAL`) and reset on the next success. The task is
cancelled cleanly on shutdown.

Env vars:
- `USGS_FEED` (default `all_day`): feed level, e.g. `all_hour`, `all_day`,
  `2.5_day`, `significant_week`. Feed URL:
  `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{level}.geojson`.
- `POLL_INTERVAL` (default `60`): seconds between polls.

Ingest is normalized to the canonical quake shape (see skills/usgs-ingest):
null magnitude/depth/place are kept null, never defaulted; longitude is
folded to -180..180; `occurred_at` converts epoch-ms to UTC. Dedup is via
the `UNIQUE (source, source_id)` constraint on `quakes`; every write is
`INSERT ... ON CONFLICT (source, source_id) DO UPDATE`, so re-polling the
same window is idempotent (see app/routers/quakes.py).

## Manifest and ingest

`app/manifest.py` lists the real sources under `data/` (mounted read-only
at `DATA_DIR`, default `/data/raw`):

| kind   | source (relative to DATA_DIR)              | target                          |
|--------|----------------------------------------------|----------------------------------|
| vector | `global-tectonic.json`                        | table `tectonic_boundaries`      |
| vector | `global-faultlines.json`                      | table `fault_lines`              |
| vector | `global-tectonic-points.js` (JS wrapper)      | table `tectonic_points`          |
| raster | `LS_hazard_map_final/LS Hazard Map.tif`       | COG `ls_hazard_map` (categorical)|
| raster | `PGA_Hazard_Map/PGA_Hazard_World.tif`         | COG `pga_hazard_world` (categorical)|

`global-tectonic-points.js` has no bare `.json` twin; it is
`window.EQ_DATA[...] = {GEOJSON};`. `app/routers/vector.py`'s
`extract_geojson_from_js` slices the first `{` to the last `}`, validates
it as JSON, and writes a temp `.geojson` file that ogr2ogr reads directly.
The `.js` duplicates of the two `.json` vectors, `*.sr.lock`, `Thumbs.db`,
and raster sidecars (`.tfw .ovr .aux.xml .vat.dbf .vat.cpg .xml`) are not
in the manifest and are never touched.

Run the full ingest inside the geo container:
```
docker compose exec geo python -m scripts.ingest
```
or, once built and running standalone:
```
python -m scripts.ingest
```
It loads every VECTORS entry via `import_local_file` (same code path as
`POST /vector/import`), converts every RASTERS entry via
`process_raster_file` (same code path as `POST /raster/process`), and
prints a summary (rows per table, COGs with per-band min/max). Idempotent:
vector loads always `-overwrite`; raster conversion skips existing COGs
but still refreshes stats/manifest/`imported_layers`; safe to re-run.

## DATA_DIR / COG_DIR

- `DATA_DIR` (default `/data/raw`): raw source vectors and rasters,
  mounted read-only from the repo's `data/` folder. `path` values in
  `/vector/import` and `/raster/*` requests must resolve under `DATA_DIR`;
  remote `http(s)` URLs stream through GDAL's `/vsicurl/` driver instead.
- `COG_DIR` (default `/data/cogs`): where `/raster/process` writes COGs
  and `manifest.json`. Mounted read-write in geo, read-only in titiler, at
  the same path in both, so a COG's `url=/data/cogs/<name>.tif` resolves
  in both containers without translation.

## Local dev

```
docker compose up geo
curl http://localhost:3091/health
curl http://localhost:3091/tools
docker compose exec geo python -m scripts.ingest
curl http://localhost:3091/raster/catalog
```
