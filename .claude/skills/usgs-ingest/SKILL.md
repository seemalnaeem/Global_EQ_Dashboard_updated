---
name: usgs-ingest
description: Fetch and normalize USGS/EMSC earthquake GeoJSON feeds into the canonical quake shape. Use when building or fixing feed ingestion.
---

# USGS / EMSC Ingest

## Feeds
USGS GeoJSON summary feeds update every minute:
`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{level}.geojson`
where level is `all_hour`, `all_day`, `2.5_day`, `significant_week`, etc.

## Feature shape (USGS)
```
feature.id                      -> source_id
feature.geometry.coordinates    -> [lon, lat, depth_km]
feature.properties.mag          -> magnitude (nullable)
feature.properties.time         -> epoch ms UTC -> occurred_at
feature.properties.place        -> place (nullable)
```

## Normalize to canonical
```
{ source: "usgs", source_id: id,
  lon, lat, depth_km: coords[2],
  magnitude: mag,            // keep null if null
  occurred_at: new Date(time).toISOString(),
  place, raw: feature }
```

## Must handle
- Null `mag` and null `place`. Do not default to 0 or empty; keep null.
- Longitude outside -180..180 from some feeds; normalize.
- Antimeridian points near +/-180.
- Duplicate ids across overlapping polls; upsert on `(source, source_id)`.
- Feed timeout or 429; retry with backoff, keep the schedule.

## Verify
Count features in vs rows upserted, spot-check one id against the live feed.
