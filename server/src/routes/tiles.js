// GET /api/tiles/:layer/:z/:x/:y.pbf
//   Mapbox Vector Tile (MVT, application/vnd.mapbox-vector-tile) for one
//   imported vector layer at a z/x/y tile address, rendered with
//   ST_AsMVT/ST_AsMVTGeom in EPSG:3857 (source data is SRID 4326).
//   :layer is checked against the imported_layers whitelist (kind='vector',
//   the same one used by GET /api/layers/:name); unknown -> 404.
//   z: 0-24. x, y: integers in 0..(2^z - 1); anything else -> 400.
//   Response: raw MVT bytes, Cache-Control: public, max-age=3600.
//   A tile with no features in range -> 204 No Content.
import { Router } from 'express';
import { validateParams } from '../lib/validate.js';
import { tileParamsSchema } from '../validators/tilesValidator.js';
import { getTile } from '../controllers/tilesController.js';

const router = Router();

router.get('/:layer/:z/:x/:y.pbf', validateParams(tileParamsSchema), getTile);

export default router;
