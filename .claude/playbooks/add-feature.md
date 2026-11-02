# Playbook: Add a Feature

End-to-end feature across the stack. Run steps with the owning agent.

1. **Define the contract** (backend). Request and response shapes, GeoJSON if
   spatial. Write the route header doc first.
2. **Schema** (db). Add migration and indexes if new data is stored. Reversible.
3. **Query/logic** (db + backend). Parameterized query, thin controller, service
   holds logic. Validate inputs.
4. **Geo compute** (geoprocessing), if analytics are needed. Async for long jobs.
5. **Middleware** (middleware). Add rate limit and cache for new read endpoints.
6. **Client** (frontend). Typed API hook, then UI. Handle loading, empty, error,
   and null fields.
7. **Tests**. One happy path plus one bad input per layer touched.
8. **Verify**. Run the flow end to end against real feed sample data.

Handoff note: state the exact contract when passing between agents so shapes match.
