# .claude Context Engineering

Context for the Global Earthquake Dashboard (PERN + FastAPI). Layered by concern
so each agent loads only what it needs.

## Agents (`agents/`)
Five layer owners, delegate by area:
- `frontend` React map and UI (`client/`)
- `backend` Express REST/WebSocket (`server/`)
- `middleware` auth, rate limit, cache, errors (`server/middleware/`)
- `db` PostgreSQL + PostGIS (`db/`)
- `geoprocessing` FastAPI ingest and analytics (`geo/`)

## Skills (`skills/`)
Task recipes: `usgs-ingest`, `postgis-query`, `react-map`, `express-endpoint`,
`fastapi-geoproc`.

## Playbooks (`playbooks/`)
Procedures: `add-feature`, `ingest-pipeline`, `deploy`, `incident-response`.

## Rules (`rules/`)
`guardrails` (hard limits), `security`, `coding-standards`, `geospatial`.

## Memory (`memory/`)
`architecture`, `domain-glossary`, `decisions`.

## Ground rules for every agent
UTC and SRID 4326 everywhere. Upsert-only ingest, keep raw payloads. Validate at
boundaries. No em-dashes. Each agent edits only its own layer. Read `rules/guardrails.md`
before anything that moves or deletes data.
