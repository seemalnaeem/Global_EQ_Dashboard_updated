import { AppError } from '../lib/errors.js';

// Central error handler. Must be mounted last. Maps known AppError types to
// status codes, hides stack traces and internals outside development.
export function errorHandler(err, req, res, next) {
  void next;
  const isDev = process.env.NODE_ENV === 'development';
  const statusCode = (err instanceof AppError && err.statusCode) || err.statusCode || 500;
  const message = statusCode < 500 || isDev ? err.message : 'Internal server error';

  console.error(`[error] ${req.method} ${req.originalUrl} -> ${statusCode}: ${err.message}`);

  const body = { status: 'error', message };
  if (err instanceof AppError && err.details) body.details = err.details;
  if (isDev) body.stack = err.stack;

  res.status(statusCode).json(body);
}
