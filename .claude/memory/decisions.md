# Memory: Decisions

Design decisions and why, newest first. Append, do not rewrite history.

## 2026-08-13 USGS live feed poller and new magnitude scale
- **USGS poller in geo**: geo polls the USGS summary feed (env USGS_FEED, default
  all_day) every POLL_INTERVAL seconds on a startup background task, normalizes,
  and upserts into `quakes` ON CONFLICT (source, source_id) so duplicates and
  event updates are handled. History accumulates across polls. geo is bind-mounted
  now too (restart to apply code, no rebuild).
- **Magnitude buckets changed** to match the requested legend: >= 6.1 dark red,
  5.1-6.0 amber, 4.1-5.0 cyan, 3.0-4.0 green, < 3.0 or null gray. Not colorblind
  safe (red/green), but it is what the reference specifies. Legend mirrors it.
- **Quake date filter**: the client filters quakes by date via the existing
  /api/quakes from/to params.

## 2026-08-13 Client runs in live-edit dev mode
- **Client is bind-mounted for live editing**: docker-compose mounts `./client:/app`
  plus an anonymous `/app/node_modules` volume, and vite uses `watch.usePolling`
  (Docker Desktop on Windows drops inotify events across the mount). Host edits
  under `client/` hot-reload with no rebuild, which also sidesteps the flaky
  registry DNS. Keep this. Switch to a built image only when hosting for other
  systems (drop the bind mount, rebuild). server/geo/db still run from images.

## 2026-08-13 Vector tiles via ST_AsMVT
- **Vectors as MVT, not GeoJSON**: PostGIS layers are served as Mapbox Vector
  Tiles from an Express endpoint using ST_AsMVT + ST_AsMVTGeom + ST_TileEnvelope,
  one parameterized query per tile. Why: shipping whole layers (fault_lines is
  ~8.6MB, tehsil is 553 polygons) does not scale; tiles load per viewport and
  simplify by zoom. The client uses Mapbox vector sources with source-layer set
  to the layer name. Rasters stay on TiTiler (TiPg is vector-only).
- **Vector tile URLs are origin-anchored, not relative**: Mapbox parses vector
  tiles in a Web Worker, where a relative path resolves against the worker blob
  and returns the SPA HTML fallback ("failed to parse"). Anchoring to
  window.location.origin fixes it and stays IP-independent. Raster tiles load on
  the main thread, so their relative URLs are fine.

## 2026-08-13 Raster serving and map library
- **Rasters as COG + TiTiler**: geo converts raw GeoTIFFs to Cloud Optimized
  GeoTIFF with pyramids once, TiTiler serves dynamic XYZ tiles. Why: no full
  raster downloads, fast zoom, and symbolization stays a client concern.
- **Client-side color ramps**: the client sets `colormap_name` and `rescale` on
  the tile URL. Why: users re-style hazard maps without any server reprocessing.
- **Mapbox GL, not Leaflet**: switched the map library per requirement. GeoJSON
  `[lon, lat]` is Mapbox native, so no coordinate swap. Needs VITE_MAPBOX_TOKEN.
- **First real data**: global tectonic boundaries, fault lines, tectonic points
  (vectors into PostGIS); Landslide and PGA hazard maps (rasters to COG). The
  `.js` vector duplicates and ArcGIS lock/thumbnail files are skipped.

## 2026-08-13 Initial architecture
- **PERN + FastAPI split**: Node/Express serves the API and realtime; Python
  handles ingest and geospatial analytics where GeoPandas/Shapely are strongest.
  Why: right tool per job without forcing one language across the stack.
- **PostGIS geography(Point,4326)**: real-world distances in meters and a single
  SRID everywhere. Why: avoids reprojection bugs and unit confusion.
- **Upsert on (source, source_id)**: idempotent ingest across overlapping polls
  and replays. Why: feeds re-send and update events; we must not duplicate.
- **Keep raw jsonb**: store the untouched feed payload. Why: reprocess without
  refetching when normalization changes or a feed disappears.
- **Fixed magnitude color scale**: not data-relative. Why: maps stay comparable
  across time and regions.
