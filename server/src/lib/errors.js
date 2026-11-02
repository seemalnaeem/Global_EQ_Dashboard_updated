// Known error types. The central error handler (middleware/error.js) maps
// these to status codes and hides everything else behind a generic 500.
export class AppError extends Error {
  constructor(message, statusCode = 500, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class UpstreamError extends AppError {
  constructor(message = 'Upstream service error', statusCode = 502) {
    super(message, statusCode);
    this.name = 'UpstreamError';
  }
}
