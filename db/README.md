# db

Dockerized PostGIS for the Global Earthquake Dashboard.

## Image
`postgis/postgis:16-3.4`. Listens on 5432 in the container (host maps to 5438).

## Init scripts
Files in `init/` are copied to `/docker-entrypoint-initdb.d/` and run once,
in filename order, only on first boot of an empty data volume.
- `01_extensions.sql`: postgis, postgis_raster, postgis_topology, pg_trgm.
- `02_schema.sql`: `quakes` table and `imported_layers` metadata table.

## Schema
`quakes`: id, source, source_id, geom geography(Point,4326), magnitude,
depth_km, occurred_at, place, raw jsonb, ingested_at. Unique on
(source, source_id) so feed replays are safe upserts. Indexes: GiST on geom,
BRIN on occurred_at, btree on magnitude, gin trigram on place.

`imported_layers`: id, name, kind ('vector'|'raster'), source_path, srid,
feature_count, imported_at. Tracks future ogr2ogr/GDAL imports from the geo
service.

## Connect
Runtime env: POSTGRES_USER=eq, POSTGRES_PASSWORD=eq, POSTGRES_DB=earthquake.

From other containers on the compose network:
`postgresql://eq:eq@db:5432/earthquake`

From the host machine (port 5438 mapped by docker-compose):
`postgresql://eq:eq@localhost:5438/earthquake`

```
psql "postgresql://eq:eq@localhost:5438/earthquake"
```

## Notes
- Migrations after this baseline must be additive and reversible, never edit
  a shipped file in `init/`.
- Query patterns and examples: see `.claude/skills/postgis-query/SKILL.md`.
