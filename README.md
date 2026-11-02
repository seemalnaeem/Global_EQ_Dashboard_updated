# Global Earthquake Dashboard

Full stack, dockerized earthquake monitoring and geoprocessing platform. Ingests
seismic feeds and geospatial data (vectors and rasters), stores them in PostGIS,
serves them through an Express API, runs GDAL/OGR analytics in Python FastAPI, and
renders an interactive React map.

## Stack and ports

| Service | Tech                          | Container port | Host port |
|---------|-------------------------------|----------------|-----------|
| client  | React + Vite + Mapbox GL      | 5177           | 5177      |
| server  | Node + Express + WebSocket    | 3090           | 3090      |
| geo     | Python FastAPI + GDAL/OGR     | 3091           | 3091      |
| titiler | TiTiler dynamic raster tiles  | 8000           | 3092      |
| db      | PostgreSQL 16 + PostGIS 3     | 5432           | 5438      |

Backend services use the 3090-3099 range, the frontend uses 5177, the database
uses 5438. All are overridable in `.env` (for example set `CLIENT_PORT=5178` if
5177 is taken by another app on the host). The client needs `VITE_MAPBOX_TOKEN`
in `.env` for the base map; overlays and raster tiles work without it.

## Geoprocessing toolchain

The `geo` service is built on the OSGeo GDAL image, so it ships `gdal`, `ogr2ogr`,
GDAL Python bindings, plus GeoPandas, Shapely, Fiona, and pyproj. It handles both
vector (ogr2ogr into PostGIS) and raster (gdalinfo, gdal.Warp) work. Downloaded
data lives in the `geo_data` volume at `/data`. Check the toolchain any time:

    curl http://localhost:3091/tools

### Loaded data

The `data/` folder is mounted read-only into geo at `/data/raw` and ingested by
`docker compose exec geo python -m scripts.ingest` (idempotent). Current sources:

- Vectors into PostGIS: `fault_lines`, `tectonic_boundaries`, `tectonic_points`
- Rasters to COG for TiTiler: `ls_hazard_map`, `pga_hazard_world` (Landslide and
  PGA hazard). Served as `/tiles/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png` with
  client-chosen `colormap_name` and `rescale`.

Skipped: the `.js` vector duplicates and ArcGIS lock/thumbnail files.

Live seismic feeds (USGS/EMSC) into the `quakes` table are a separate poller and
are not part of this static import, so the map shows layers and hazard overlays
until a feed is wired.

## Quick start

    cp .env.example .env
    docker compose up --build

First boot builds all images and initializes PostGIS. When it settles, open the
client in a browser (see IP note below).

## Accessing it by IP (DHCP friendly)

The stack runs on a Docker bridge network, so each container gets a Docker-managed
IP automatically. Ports publish on `0.0.0.0`, which means the services answer on
whatever IP the host machine currently holds. If your host IP changes (DHCP lease,
new network), nothing needs rebuilding. Just open the new address:

    http://<current-host-ip>:5177

The frontend talks to the backend through same-origin relative paths (`/api`,
`/geo`, `/ws`) proxied by Vite, so there is no IP baked into the app and no CORS
to configure. Find the host IP with `ipconfig` (Windows) or `hostname -I` (Linux).

## Service map and internal DNS

On the `eqnet` bridge network containers reach each other by name:

- `client` proxies `/api` -> `server:3090`, `/geo` -> `geo:3091`, `/ws` -> `server:3090`
- `server` connects to `db:5432` and calls `geo:3091` for analytics
- `geo` connects to `db:5432` and reads/writes `/data`

## Common commands

    docker compose up --build         # build and start
    docker compose up -d              # start detached
    docker compose ps                 # status
    docker compose logs -f server     # tail one service
    docker compose down               # stop (keeps volumes)
    docker compose down -v            # stop and wipe data

    docker compose exec db psql -U eq -d earthquake       # DB shell
    docker compose exec geo bash                          # geo shell (gdal, ogr2ogr)

## Layout

    client/   React + Vite frontend
    server/   Express API and WebSocket, with middleware
    geo/      FastAPI geoprocessing (GDAL, OGR, GeoPandas)
    db/       PostGIS Dockerfile and init SQL
    .claude/  Agents, skills, playbooks, rules, and memory
    docker-compose.yml
