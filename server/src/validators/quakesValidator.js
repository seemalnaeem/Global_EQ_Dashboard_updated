import { z } from 'zod';
import { numberField, bboxField } from './shared.js';

// Query validation for GET /api/quakes. Reads raw query strings, coerces to
// numbers/dates, clamps limit, and rejects malformed bbox, negative radius,
// mixed spatial modes, and reversed time ranges with a clear message.
// numberField and bboxField are shared with layersValidator.js.

function dateField(label) {
  return z.string().transform((v, ctx) => {
    const t = Date.parse(v);
    if (Number.isNaN(t)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a valid date/time` });
      return z.NEVER;
    }
    return new Date(t).toISOString();
  });
}

export const quakesQuerySchema = z
  .object({
    bbox: bboxField.optional(),
    lon: numberField('lon', { min: -180, max: 180 }).optional(),
    lat: numberField('lat', { min: -90, max: 90 }).optional(),
    radius_m: numberField('radius_m', { exclusiveMin: 0 }).optional(),
    min_mag: numberField('min_mag').optional(),
    max_mag: numberField('max_mag').optional(),
    min_depth: numberField('min_depth').optional(),
    max_depth: numberField('max_depth').optional(),
    from: dateField('from').optional(),
    to: dateField('to').optional(),
    limit: numberField('limit', { min: 1, max: 10000 }).optional(),
    offset: numberField('offset', { min: 0 }).optional()
  })
  .superRefine((q, ctx) => {
    const hasBbox = q.bbox !== undefined;
    const radiusParts = [q.lon, q.lat, q.radius_m];
    const hasAnyRadiusPart = radiusParts.some((v) => v !== undefined);
    const hasAllRadiusParts = radiusParts.every((v) => v !== undefined);

    if (hasBbox && hasAnyRadiusPart) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'use either bbox or lon/lat/radius_m, not both' });
    }
    if (hasAnyRadiusPart && !hasAllRadiusParts) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'radius search needs lon, lat, and radius_m together' });
    }
    if (q.from !== undefined && q.to !== undefined && q.from > q.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'from must not be after to' });
    }
    if (q.min_mag !== undefined && q.max_mag !== undefined && q.min_mag > q.max_mag) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'min_mag must not exceed max_mag' });
    }
    if (q.min_depth !== undefined && q.max_depth !== undefined && q.min_depth > q.max_depth) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'min_depth must not exceed max_depth' });
    }
  })
  .transform((q) => ({
    bbox: q.bbox,
    radius: q.lon !== undefined ? { lon: q.lon, lat: q.lat, radiusM: q.radius_m } : undefined,
    minMag: q.min_mag,
    maxMag: q.max_mag,
    minDepth: q.min_depth,
    maxDepth: q.max_depth,
    from: q.from,
    to: q.to,
    limit: q.limit ?? 100,
    offset: q.offset ?? 0
  }));
