import { z } from 'zod';
import { numberField, bboxField } from './shared.js';

// Validation for GET /api/layers and GET /api/layers/:name.

// Syntax-only check (safe identifier shape), shared with the tiles
// endpoint (tilesValidator.js) since both take a layer/table name path
// param. This is NOT the security boundary; layersService checks the name
// against the imported_layers whitelist before any table name reaches SQL.
export const layerNameField = z
  .string()
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/, 'must be a simple identifier (letters, digits, underscore)');

export const layerNameParamSchema = z.object({ name: layerNameField });

export const layersListQuerySchema = z
  .object({
    limit: numberField('limit', { min: 1, max: 1000 }).optional(),
    offset: numberField('offset', { min: 0 }).optional()
  })
  .transform((q) => ({
    limit: q.limit ?? 100,
    offset: q.offset ?? 0
  }));

export const layerFeaturesQuerySchema = z
  .object({
    bbox: bboxField.optional(),
    // Simplify tolerance in degrees (geom is SRID 4326). Guarded to a small
    // range: this is for overview-zoom rendering, not aggressive decimation.
    simplify: numberField('simplify', { min: 0, max: 10 }).optional(),
    limit: numberField('limit', { min: 1, max: 50000 }).optional()
  })
  .transform((q) => ({
    bbox: q.bbox,
    simplify: q.simplify,
    limit: q.limit ?? 5000
  }));
