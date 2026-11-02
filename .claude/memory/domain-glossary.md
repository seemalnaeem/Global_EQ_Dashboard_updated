# Memory: Domain Glossary

Seismic terms as this project uses them.

- **Magnitude**: energy of the quake (Richter/moment). Float, nullable in feeds.
- **Depth**: km below surface. Shallow quakes often feel stronger. Nullable.
- **Epicenter**: surface point above the origin. Our stored `geom` point.
- **Hypocenter/focus**: the actual underground origin (epicenter + depth).
- **Occurred_at**: event time in UTC, from the feed. Not our ingest time.
- **Source / source_id**: feed name (usgs, emsc) and its native event id. Dedup key.
- **Feed levels (USGS)**: all_hour, all_day, 2.5_day, significant_week, etc.
- **PostGIS geography vs geometry**: geography for meter distances on a sphere,
  geometry for flat-plane math.
- **Antimeridian**: the 180/-180 longitude line; points near it need special care.
- **DBSCAN**: density clustering used to group nearby quakes into swarms.
