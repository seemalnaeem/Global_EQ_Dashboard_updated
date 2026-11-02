import { z } from 'zod';
import { intField } from './shared.js';
import { layerNameField } from './layersValidator.js';

// Validation for GET /api/tiles/:layer/:z/:x/:y.pbf.
//
// :layer is syntax-checked here (safe identifier shape, shared with
// layersValidator); this is NOT the security boundary. tilesService checks
// it against the imported_layers whitelist before any table name reaches
// SQL, same as GET /api/layers/:name.
//
// z, x, y are checked as a standard XYZ tile address: z in 0..24, and x, y
// each in 0..(2^z - 1). Out-of-range or non-integer values get 400.
export const tileParamsSchema = z
  .object({
    layer: layerNameField,
    z: intField('z', { min: 0, max: 24 }),
    x: intField('x', { min: 0 }),
    y: intField('y', { min: 0 })
  })
  .transform((v, ctx) => {
    const maxIndex = 2 ** v.z - 1;
    if (v.x > maxIndex) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `x must be <= ${maxIndex} at zoom ${v.z}`,
        path: ['x']
      });
      return z.NEVER;
    }
    if (v.y > maxIndex) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `y must be <= ${maxIndex} at zoom ${v.z}`,
        path: ['y']
      });
      return z.NEVER;
    }
    return v;
  });
