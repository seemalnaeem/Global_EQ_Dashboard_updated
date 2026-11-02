# Playbook: Feed Ingestion Pipeline

How a seismic feed becomes a queryable quake. Owned by geoprocessing + db.

1. **Fetch** (geo). Poll the feed (USGS GeoJSON, EMSC). Retry with backoff.
   Respect the feed's update cadence; do not hammer it.
2. **Parse** (geo). Read features. Expect gaps: null magnitude, null depth,
   missing place. Skip only truly unparseable records, and log them.
3. **Normalize** (geo). Map to the canonical shape:
   `source, source_id, geom(lon,lat 4326), magnitude, depth_km, occurred_at(utc),
   place, raw(jsonb)`. Normalize longitude to -180..180.
4. **Upsert** (db). Insert on conflict `(source, source_id)` do update. Replays
   and overlapping polls are safe by design.
5. **Notify** (backend). Emit new events over WebSocket. Bust the query cache.
6. **Verify**. Count in vs count written, check dedupe worked, spot-check one row
   against the source feed.

Failure handling: one bad record never stops the batch. A failed poll retries;
it does not drop the schedule.
