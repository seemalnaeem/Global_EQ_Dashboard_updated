// GET /api/hazard-layers
//   Catalog of external seismic hazard raster-tile layers (OpenQuake/GEM PGA
//   hazard maps), read from hazard_layers. Each entry is augmented with
//   tiles_url: '/api/hazard-tiles/<name>/{z}/{x}/{y}.png', our own proxy
//   path. The upstream tile_url_template is never sent to the client.
//   Response: { layers: [{ name, title, provider, attribution, min_zoom,
//   max_zoom, legend, bounds, tiles_url }] }.
//
// GET /api/hazard-tiles/:name/:z/:x/:y.png
//   Proxies one PNG tile from the external OpenQuake/GEM host, so the client
//   never contacts that host directly. :name is checked against the
//   hazard_layers whitelist before any upstream request is attempted;
//   unknown -> 404. z: 0-24. x, y: non-negative integers; anything else ->
//   400. Upstream failure or non-2xx -> 502. Empty/204 upstream -> 204.
//   Response: image/png, Cache-Control: public, max-age=86400.
import { Router } from 'express';
import { validateParams } from '../lib/validate.js';
import { hazardTileParamsSchema } from '../validators/hazardValidator.js';
import { getHazardLayers, getHazardTile } from '../controllers/hazardController.js';
import { tileRateLimit } from '../middleware/rateLimit.js';

const router = Router();

router.get('/hazard-layers', getHazardLayers);
router.get(
  '/hazard-tiles/:name/:z/:x/:y.png',
  tileRateLimit,
  validateParams(hazardTileParamsSchema),
  getHazardTile
);

export default router;
