# Geospatial Rules

## Coordinates and projections
- GeoJSON order is `[lon, lat]`. Leaflet uses `[lat, lon]`. Convert at the edge.
- Store everything in SRID 4326. Reproject only inside a computation.
- Use `geography` for real-world distance (meters). Use `geometry` for flat math.

## Common pitfalls
- Antimeridian (180/-180): quakes near the date line split. Handle before render
  and in bbox queries. Do not assume a continuous rectangle.
- Poles: high-latitude distance math distorts. Prefer geography functions.
- Longitude can arrive as 0..360 from some feeds. Normalize to -180..180.

## Magnitude color scale (fixed buckets)
- >= 6.1 dark red, 5.1-6.0 amber, 4.1-5.0 cyan, 4.0 or less green (includes
  < 3.0), null/unknown gray.
- Fixed, not data-relative, so maps stay comparable over time. The map legend
  mirrors these buckets exactly.

## Rasters
- Convert raw GeoTIFFs to COG with overviews once (idempotent), then serve tiles
  dynamically via TiTiler. Do not ship whole rasters to the client.
- Symbolize on the client: TiTiler applies `colormap_name` and `rescale` per
  request, so color ramps change without regenerating data.
- Keep the COG path identical in the geo and titiler containers so `url=` resolves.

## Performance
- GiST index on the geometry column, always.
- Cluster or aggregate server-side above ~1000 points. Do not ship all to the client.
- Cache expensive analytics (density grids, clusters) with a short TTL.

## Data honesty
- Depth in km, magnitude as reported. Null when absent, never zero-filled.
