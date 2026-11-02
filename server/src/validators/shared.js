import { z } from 'zod';

// Shared zod field builders for query params. Used by any validator that
// needs a coerced, bounded number or a bbox of 4 comma-separated numbers, so
// the rules (and error messages) stay identical across spatial endpoints.

// Coerced non-negative integer field (e.g. tile z/x/y). Rejects decimals,
// signs, and non-digit input outright instead of truncating.
export function intField(label, opts = {}) {
  return z.string().transform((v, ctx) => {
    if (!/^\d+$/.test(v)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a non-negative integer` });
      return z.NEVER;
    }
    const n = Number(v);
    if (opts.min !== undefined && n < opts.min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be >= ${opts.min}` });
      return z.NEVER;
    }
    if (opts.max !== undefined && n > opts.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be <= ${opts.max}` });
      return z.NEVER;
    }
    return n;
  });
}

export function numberField(label, opts = {}) {
  return z.string().transform((v, ctx) => {
    const n = Number(v);
    if (v.trim() === '' || Number.isNaN(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a number` });
      return z.NEVER;
    }
    if (opts.min !== undefined && n < opts.min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be >= ${opts.min}` });
      return z.NEVER;
    }
    if (opts.max !== undefined && n > opts.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be <= ${opts.max}` });
      return z.NEVER;
    }
    if (opts.exclusiveMin !== undefined && n <= opts.exclusiveMin) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be greater than ${opts.exclusiveMin}` });
      return z.NEVER;
    }
    return n;
  });
}

export const bboxField = z.string().transform((v, ctx) => {
  const parts = v.split(',').map((s) => s.trim());
  if (parts.length !== 4) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'bbox must have 4 comma-separated numbers: minLon,minLat,maxLon,maxLat'
    });
    return z.NEVER;
  }
  const nums = parts.map(Number);
  if (nums.some((n) => Number.isNaN(n))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bbox values must be numbers' });
    return z.NEVER;
  }
  const [minLon, minLat, maxLon, maxLat] = nums;
  if (minLon < -180 || minLon > 180 || maxLon < -180 || maxLon > 180) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bbox longitude must be between -180 and 180' });
    return z.NEVER;
  }
  if (minLat < -90 || minLat > 90 || maxLat < -90 || maxLat > 90) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bbox latitude must be between -90 and 90' });
    return z.NEVER;
  }
  if (minLat > maxLat) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bbox minLat cannot exceed maxLat' });
    return z.NEVER;
  }
  // minLon > maxLon is a valid antimeridian-crossing bbox, not an error.
  return { minLon, minLat, maxLon, maxLat };
});
