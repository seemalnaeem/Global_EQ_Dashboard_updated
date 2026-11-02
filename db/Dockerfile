FROM postgis/postgis:16-3.4

# init scripts run once, in filename order, on first boot with an empty data dir
COPY init/01_extensions.sql /docker-entrypoint-initdb.d/01_extensions.sql
COPY init/02_schema.sql /docker-entrypoint-initdb.d/02_schema.sql

EXPOSE 5432
