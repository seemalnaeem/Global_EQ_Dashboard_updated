-- Extensions needed before any table/index that depends on them.
-- postgis: core spatial types and functions (geometry, geography).
-- postgis_raster: raster type, needed since geo service imports GDAL rasters via ogr2ogr/GDAL.
-- postgis_topology: topology support, kept alongside postgis_raster for full PostGIS toolset.
-- pg_trgm: trigram index support for fuzzy text search on place names.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_raster;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
