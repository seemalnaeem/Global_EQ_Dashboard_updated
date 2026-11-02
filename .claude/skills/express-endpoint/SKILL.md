---
name: express-endpoint
description: Add a validated, tested Express endpoint for quake data. Use when creating REST routes in server/.
---

# Express Endpoint

## Layout
`route -> validate -> controller (thin) -> service (logic) -> db layer (query)`.

## Steps
1. **Route header doc**: method, path, params, response shape (GeoJSON if spatial).
2. **Validate** with zod/express-validator. Clamp bbox, radius, magnitude, time.
   Reject reversed ranges and negative radius with 400 plus a clear message.
3. **Controller** parses validated input, calls the service, returns the response.
   No logic here.
4. **Service** does the work, calls the db layer with parameterized queries.
5. **Errors** flow to the shared error handler via `next(err)`. No swallowing.

## Defaults
- Paginate: default 100, cap 1000, return total count.
- Spatial responses are GeoJSON FeatureCollections, SRID 4326.
- Async handlers wrapped so rejections reach the error handler.

## Test (supertest)
Happy path plus one bad input (bad bbox or reversed time range -> 400).
