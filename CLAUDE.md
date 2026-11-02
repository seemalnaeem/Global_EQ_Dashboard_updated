# Global Earthquake Dashboard

Real-time global earthquake monitoring and visualization. Ingests seismic feeds
(USGS, EMSC), stores them in PostGIS, serves them through an Express API, runs
spatial analytics in Python FastAPI, and renders an interactive React map.

## Stack

| Layer         | Tech                                   | Home dir        |
|---------------|----------------------------------------|-----------------|
| Frontend      | React + Vite, Leaflet/MapLibre         | `client/`       |
| Backend API   | Node + Express                         | `server/`       |
| Middleware    | Express middleware, auth, rate limit   | `server/middleware/` |
| Database      | PostgreSQL 16 + PostGIS 3              | `db/`           |
| Geoprocessing | Python 3.12 + FastAPI, GeoPandas       | `geo/`          |

## Data flow

`Feed (USGS/EMSC GeoJSON)` -> `geo/ ingest + normalize` -> `PostGIS quakes table`
-> `Express REST/WebSocket` -> `React map + panels`. Heavy spatial work
(clustering, density, nearest-fault) runs in FastAPI and writes back to PostGIS.

## Agents

Delegate by layer. Each agent owns one slice and its guardrails:
`frontend`, `backend`, `middleware`, `db`, `geoprocessing`. See `.claude/agents/`.

## Where things live

- Agents: `.claude/agents/`
- Reusable skills: `.claude/skills/`
- Step-by-step procedures: `.claude/playbooks/`
- Rules and guardrails: `.claude/rules/`
- Project memory: `.claude/memory/`

## Conventions

- No em-dashes in code, comments, or docs. Use commas or parentheses.
- Times are UTC everywhere. Store `timestamptz`, format on the client.
- Coordinates are `[lon, lat]` (GeoJSON order), SRID 4326.
- Magnitude is a float, depth is in km, both nullable (feeds have gaps).
- Never invent seismic data. If a feed lacks a field, keep it null.

## Quick commands

- Client: `cd client && npm run dev`
- Server: `cd server && npm run dev`
- Geo: `cd geo && uvicorn app.main:app --reload`
- DB: `docker compose up db` then `npm run migrate -w server`
