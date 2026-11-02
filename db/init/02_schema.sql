-- Canonical quakes table. geography(Point,4326) gives real-world meter
-- distances for radius/nearest queries (see rules/geospatial.md).
CREATE TABLE IF NOT EXISTS quakes (
    id BIGSERIAL PRIMARY KEY,
    source text NOT NULL,
    source_id text NOT NULL,
    geom geography(Point, 4326) NOT NULL,
    magnitude float,
    depth_km float,
    occurred_at timestamptz NOT NULL,
    place text,
    raw jsonb NOT NULL,
    ingested_at timestamptz NOT NULL DEFAULT now(),
    -- one row per feed record, replays of the same feed are safe upserts
    UNIQUE (source, source_id)
);

-- GiST index on geom, required for ST_DWithin/bbox/KNN queries to use the index.
CREATE INDEX IF NOT EXISTS quakes_geom_gist_idx ON quakes USING gist (geom);

-- BRIN on occurred_at: cheap, and quakes are ingested roughly time-ordered,
-- so BRIN ranges stay tight for the common "recent window" filter.
CREATE INDEX IF NOT EXISTS quakes_occurred_at_brin_idx ON quakes USING brin (occurred_at);

-- btree on magnitude for range filters (e.g. magnitude >= 4.5) used by the color scale.
CREATE INDEX IF NOT EXISTS quakes_magnitude_btree_idx ON quakes USING btree (magnitude);

-- Trigram index on place, supports fuzzy/partial text search from the backend.
CREATE INDEX IF NOT EXISTS quakes_place_trgm_idx ON quakes USING gin (place gin_trgm_ops);

-- Tracks vector/raster layers imported later via ogr2ogr/GDAL from geo service,
-- so we know what has been loaded, from where, and how big it was.
CREATE TABLE IF NOT EXISTS imported_layers (
    id BIGSERIAL PRIMARY KEY,
    name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('vector', 'raster')),
    source_path text NOT NULL,
    srid int,
    feature_count int,
    imported_at timestamptz NOT NULL DEFAULT now()
);
