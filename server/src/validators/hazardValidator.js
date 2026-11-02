import { z } from 'zod';
import { intField } from './shared.js';

// Validation for GET /api/hazard-tiles/:name/:z/:x/:y.png.
//
// :name is syntax-checked here only (safe identifier shape); this is NOT the
// security boundary. hazardService.getUpstreamTileUrl checks it against the
// hazard_layers whitelist (exact match) before any lookup happens, same
// pattern as tilesValidator/layersValidator.
//
// z, x, y follow the same standard XYZ tile address rules as tilesValidator:
// z in 0..24, x and y non-negative integers. Range checked against 2^z is
// skipped here (hazard tiles are a raster proxy, not computed from an
// envelope query) but non-negative/integer shape is still enforced.
const hazardLayerNameField = z
  .string()
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/, 'must be a simple identifier (letters, digits, underscore)');

export const hazardTileParamsSchema = z.object({
  name: hazardLayerNameField,
  z: intField('z', { min: 0, max: 24 }),
  x: intField('x', { min: 0 }),
  y: intField('y', { min: 0 })
});
