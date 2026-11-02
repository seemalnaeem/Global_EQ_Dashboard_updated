-- Catalog of external seismic hazard raster-tile sources (OpenQuake/GEM PGA
-- hazard maps). The server proxies tiles through /api/hazard-tiles/:name/...
-- using tile_url_template as the upstream, so the client never hits the
-- external host directly (see server/src/services/hazardService.js).
CREATE TABLE IF NOT EXISTS hazard_layers (
    name text PRIMARY KEY,
    title text NOT NULL,
    provider text,
    attribution text,
    tile_url_template text NOT NULL,   -- external XYZ template containing {z}/{x}/{y}
    min_zoom int NOT NULL DEFAULT 0,
    max_zoom int NOT NULL DEFAULT 10,
    legend jsonb NOT NULL DEFAULT '[]'::jsonb,
    bounds double precision[],
    created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO hazard_layers (name, title, provider, attribution, tile_url_template, min_zoom, max_zoom, bounds, legend)
VALUES (
    'pga_2026',
    'PGA Hazard 2026 (g)',
    'OpenQuake / GEM',
    'GEM Global Seismic Hazard Map v2026.1 (PGA, 10% in 50yr)',
    'https://maps.openquake.org/mapproxy/gshm-2026-06-04-nobg/wmts/v20260/webmercator/{z}/{x}/{y}.png',
    0,
    8,
    ARRAY[-180, -85, 180, 85]::double precision[],
    '[
        {"label":"0.00 - 0.01","color":"#ffffff"},
        {"label":"0.01 - 0.02","color":"#d7e3ee"},
        {"label":"0.02 - 0.03","color":"#b5caff"},
        {"label":"0.03 - 0.05","color":"#8fb3ff"},
        {"label":"0.05 - 0.08","color":"#7f97ff"},
        {"label":"0.08 - 0.13","color":"#abcf63"},
        {"label":"0.13 - 0.20","color":"#e8f59e"},
        {"label":"0.20 - 0.35","color":"#fffa00"},
        {"label":"0.35 - 0.55","color":"#ffd121"},
        {"label":"0.55 - 0.90","color":"#ffa30a"},
        {"label":"0.90 - 1.50","color":"#ff4c00"},
        {"label":"1.50 - 2.20","color":"#ff0000"},
        {"label":"> 2.20","color":"#603e69"}
    ]'::jsonb
)
ON CONFLICT (name) DO UPDATE SET
    title = EXCLUDED.title,
    provider = EXCLUDED.provider,
    attribution = EXCLUDED.attribution,
    tile_url_template = EXCLUDED.tile_url_template,
    min_zoom = EXCLUDED.min_zoom,
    max_zoom = EXCLUDED.max_zoom,
    bounds = EXCLUDED.bounds,
    legend = EXCLUDED.legend;

INSERT INTO hazard_layers (name, title, provider, attribution, tile_url_template, min_zoom, max_zoom, bounds, legend)
VALUES (
    'pga_2023',
    'PGA Hazard 2023 (g)',
    'OpenQuake / GEM',
    'GEM Global Seismic Hazard Map v2023.1 (PGA, 10% in 50yr)',
    'https://maps.openquake.org/mapproxy/gshm-2026-06-04-nobg/wmts/v20231/webmercator/{z}/{x}/{y}.png',
    0,
    8,
    ARRAY[-180, -85, 180, 85]::double precision[],
    '[
        {"label":"0.00 - 0.01","color":"#ffffff"},
        {"label":"0.01 - 0.02","color":"#d7e3ee"},
        {"label":"0.02 - 0.03","color":"#b5caff"},
        {"label":"0.03 - 0.05","color":"#8fb3ff"},
        {"label":"0.05 - 0.08","color":"#7f97ff"},
        {"label":"0.08 - 0.13","color":"#abcf63"},
        {"label":"0.13 - 0.20","color":"#e8f59e"},
        {"label":"0.20 - 0.35","color":"#fffa00"},
        {"label":"0.35 - 0.55","color":"#ffd121"},
        {"label":"0.55 - 0.90","color":"#ffa30a"},
        {"label":"0.90 - 1.50","color":"#ff4c00"},
        {"label":"1.50 - 2.20","color":"#ff0000"},
        {"label":"> 2.20","color":"#603e69"}
    ]'::jsonb
)
ON CONFLICT (name) DO UPDATE SET
    title = EXCLUDED.title,
    provider = EXCLUDED.provider,
    attribution = EXCLUDED.attribution,
    tile_url_template = EXCLUDED.tile_url_template,
    min_zoom = EXCLUDED.min_zoom,
    max_zoom = EXCLUDED.max_zoom,
    bounds = EXCLUDED.bounds,
    legend = EXCLUDED.legend;
