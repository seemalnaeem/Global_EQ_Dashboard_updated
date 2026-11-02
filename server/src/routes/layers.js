// GET /api/layers
//   List imported vector layers (from imported_layers, kind='vector').
//   Query params: limit (default 100, cap 1000), offset (default 0).
//   Response: { layers: [{ name, kind, feature_count }], total, limit, offset }.
//
// GET /api/layers/:name
//   GeoJSON FeatureCollection (SRID 4326) of one vector layer's features.
//   :name is checked against the imported_layers whitelist (kind='vector')
//   before it is used in any query; unknown names get 404.
//   Query params:
//     bbox=minLon,minLat,maxLon,maxLat  (optional, filters with geom &&
//       ST_MakeEnvelope(...,4326))
//     simplify=<degrees, 0-10>  (optional, wraps geom in ST_Simplify for
//       overview-zoom rendering)
//     limit (default 5000, cap 50000)
//   Rejects with 400: malformed bbox, out-of-range simplify tolerance,
//   malformed name. Rejects with 404: name not in the whitelist.
import { Router } from 'express';
import { validateQuery, validateParams } from '../lib/validate.js';
import {
  layersListQuerySchema,
  layerNameParamSchema,
  layerFeaturesQuerySchema
} from '../validators/layersValidator.js';
import { getLayers, getLayerByName } from '../controllers/layersController.js';

const router = Router();

router.get('/', validateQuery(layersListQuerySchema), getLayers);
router.get(
  '/:name',
  validateParams(layerNameParamSchema),
  validateQuery(layerFeaturesQuerySchema),
  getLayerByName
);

export default router;
