// Wraps an async route handler so a rejected promise reaches next(err)
// instead of being swallowed or crashing the process.
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
