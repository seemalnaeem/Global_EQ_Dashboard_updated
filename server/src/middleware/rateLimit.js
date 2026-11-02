import rateLimit from 'express-rate-limit';

// Per-IP limiter for /api JSON routes. Skips the tile routes (/api/tiles and
// /api/hazard-tiles), which serve many small map tiles per viewport (panning
// multiplies that), so tiles never starve the JSON endpoints like /layers and
// /rasters. Tiles get their own, higher limiter (tileRateLimit).
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/tiles') || req.path.startsWith('/hazard-tiles'),
  message: { status: 'error', message: 'Too many requests, slow down.' }
});

// Generous per-IP limiter for map vector tiles. One view can request dozens of
// tiles across layers, and they are cached client-side, so the ceiling is high
// but still bounded.
export const tileRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 6000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many tile requests, slow down.' }
});
