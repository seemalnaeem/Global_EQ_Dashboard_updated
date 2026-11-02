import { ValidationError } from './errors.js';

// Express middleware factory. Validates req.query against a zod schema and
// replaces req.query with the parsed, coerced, defaulted result. On failure
// forwards a 400 ValidationError with a readable message, never a raw parse.
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join('; ');
      return next(new ValidationError(message, result.error.issues));
    }
    req.query = result.data;
    next();
  };
}

// Same as validateQuery but for req.params (e.g. :name path segments).
export function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join('; ');
      return next(new ValidationError(message, result.error.issues));
    }
    req.params = result.data;
    next();
  };
}
