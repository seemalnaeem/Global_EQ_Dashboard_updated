import { NotFoundError } from '../lib/errors.js';

// Catches any request that did not match a route. Mounted after all routes,
// before the error handler.
export function notFound(req, res, next) {
  next(new NotFoundError(`No route for ${req.method} ${req.originalUrl}`));
}
