# Playbook: Incident Response

For outages, bad data, or feed problems. Stabilize first, fix root cause after.

## No new quakes appearing
1. Check the geo poller logs. Is the feed reachable? Rate limited?
2. Check ingest writes. Are upserts failing (schema drift, unique conflict)?
3. Check WebSocket and cache bust. Data may be in DB but not pushed.

## Bad or duplicate data on the map
1. Confirm against the source feed. Is it their data or our parse?
2. Check dedupe key `(source, source_id)`. Duplicates mean the key broke.
3. Reprocess from `raw jsonb` rather than refetching if the feed is gone.

## Slow map or API
1. Check for missing spatial or temporal index (db).
2. Confirm server-side clustering above ~1000 points (geo/backend).
3. Check cache hit rate on read endpoints (middleware).

## Rule
Never mass-delete to "clean up". Fix the pipeline, then reprocess from `raw`.
Log the timeline and root cause when resolved.
