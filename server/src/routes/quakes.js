// GET /api/quakes
// Query params:
//   bbox=minLon,minLat,maxLon,maxLat   OR   lon & lat & radius_m (meters)
//   min_mag (number), from & to (ISO datetimes), limit (default 100, cap 1000), offset (default 0)
// Rejects with 400: malformed bbox, mixed bbox+radius, negative/zero radius,
//   incomplete radius params, reversed from/to.
// Response: GeoJSON FeatureCollection (SRID 4326) plus { total, limit, offset }.
import { Router } from 'express';
import { validateQuery } from '../lib/validate.js';
import { quakesQuerySchema } from '../validators/quakesValidator.js';
import { getQuakes } from '../controllers/quakesController.js';

const router = Router();

router.get('/', validateQuery(quakesQuerySchema), getQuakes);

export default router;
