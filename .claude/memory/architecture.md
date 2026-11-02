# Memory: Architecture

Stable facts about how the system is built. Update when a boundary changes.

## Services
- `client/` React + Vite, map via Leaflet/MapLibre.
- `server/` Express REST + WebSocket, thin controllers, services hold logic.
- `server/middleware/` auth, rate limit, CORS, cache, logging, error handler.
- `db/` PostgreSQL 16 + PostGIS 3, migrations and query functions.
- `geo/` Python FastAPI, feed ingest and spatial analytics.

## Contracts
- Spatial API responses are GeoJSON FeatureCollections, SRID 4326.
- Canonical quake shape: source, source_id, geom(lon,lat), magnitude, depth_km,
  occurred_at (utc), place, raw(jsonb). Unique on (source, source_id).
- Backend calls geo over HTTP for analytics; both read/write the same PostGIS DB.

## Non-negotiables
- UTC everywhere. SRID 4326 everywhere. Upsert-only ingest. Keep raw payloads.
