---
name: postgis-query
description: Write correct, indexed PostGIS spatial and temporal queries for the quakes table. Use for radius, bbox, nearest, and aggregation queries.
---

# PostGIS Queries

Table: `quakes(geom geography(Point,4326), magnitude, depth_km, occurred_at, ...)`.
GiST index on `geom`. All queries parameterized ($1, $2, ...).

## Within radius (meters, uses index)
```sql
SELECT id, magnitude, depth_km, occurred_at,
       ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon
FROM quakes
WHERE ST_DWithin(geom, ST_MakePoint($1,$2)::geography, $3)  -- lon, lat, meters
  AND occurred_at >= $4
ORDER BY occurred_at DESC
LIMIT $5;
```

## Bounding box
```sql
WHERE geom && ST_MakeEnvelope($1,$2,$3,$4,4326)::geography  -- minlon,minlat,maxlon,maxlat
```
Note: bbox crossing the antimeridian needs two envelopes ORed together.

## Nearest N to a point
```sql
ORDER BY geom <-> ST_MakePoint($1,$2)::geography  -- KNN, index-assisted
LIMIT $3;
```

## As GeoJSON FeatureCollection
```sql
SELECT jsonb_build_object(
  'type','FeatureCollection',
  'features', jsonb_agg(ST_AsGeoJSON(q.*)::jsonb)
) FROM (...) q;
```

## Vector tiles (MVT) with ST_AsMVT
Serve imported layers as Mapbox Vector Tiles, one query per z/x/y. Layer name is
whitelist-validated (imported_layers) before being used as an identifier.
```sql
WITH env AS (SELECT ST_TileEnvelope($1,$2,$3) AS geom)      -- z, x, y
SELECT ST_AsMVT(t, $4, 4096, 'geom')                        -- $4 = layer/source-layer name
FROM (
  SELECT ST_AsMVTGeom(ST_Transform(g.geom, 3857), env.geom, 4096, 64, true) AS geom,
         <non-geom property columns>
  FROM "<layer>" g, env
  WHERE g.geom && ST_Transform(env.geom, 4326)              -- GiST index, then intersect
) t;
```
Return the bytea as `application/vnd.mapbox-vector-tile`. Empty tile (no rows) is
`204 No Content`. Property columns come from information_schema (exclude geom).

## Rules
- Distances in meters via `geography`. Name columns, no `SELECT *`.
- Filter `occurred_at` and `magnitude` alongside geom; ensure both are indexed.
