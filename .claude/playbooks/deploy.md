# Playbook: Deploy

1. **Pre-check**. Tests green across client, server, geo. Lint clean. No secrets
   in the diff.
2. **Migrate**. Run DB migrations forward. Confirm they are additive and reversible.
   Have the down step ready.
3. **Geo service**. Deploy FastAPI. Confirm dependencies are pinned and the poller
   starts without hammering feeds.
4. **API**. Deploy Express. Check env: CORS allowlist, rate limits, DB and geo URLs.
5. **Client**. Build and deploy static assets. Verify API base URL points at prod.
6. **Smoke test**. Load the map, filter by magnitude and time, confirm live events
   stream in. Check one spatial query returns real data.
7. **Watch**. Error rate, feed poll success, DB latency for the first cycle.

Rollback: revert the deploy, run the migration down step only if the new schema
blocks the old code.
