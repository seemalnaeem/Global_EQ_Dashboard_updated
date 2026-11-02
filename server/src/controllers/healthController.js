import { asyncHandler } from '../lib/asyncHandler.js';
import { pool } from '../db.js';
import { fetchGeoHealth } from '../services/geoService.js';

// GET /api/health -> { status, db, geo }
export const getHealth = asyncHandler(async (req, res) => {
  let db = 'up';
  try {
    await pool.query('SELECT 1');
  } catch {
    db = 'down';
  }

  const geo = await fetchGeoHealth();
  const status = db === 'up' ? 'ok' : 'degraded';

  res.json({ status, db, geo });
});
