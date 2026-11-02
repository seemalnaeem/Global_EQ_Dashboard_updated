# Convenience wrapper over docker compose. Works where GNU make is available.
# On Windows without make, run the docker compose commands directly (see README).

.PHONY: up down build rebuild logs ps psql geo-shell clean

up:            ## Build and start the stack
	docker compose up --build

detach:        ## Start detached
	docker compose up --build -d

down:          ## Stop, keep data volumes
	docker compose down

rebuild:       ## Rebuild images from scratch
	docker compose build --no-cache

logs:          ## Tail all logs
	docker compose logs -f

ps:            ## Show service status
	docker compose ps

psql:          ## Open a psql shell
	docker compose exec db psql -U eq -d earthquake

geo-shell:     ## Shell into the geo service (gdal, ogr2ogr)
	docker compose exec geo bash

clean:         ## Stop and wipe all data volumes
	docker compose down -v
