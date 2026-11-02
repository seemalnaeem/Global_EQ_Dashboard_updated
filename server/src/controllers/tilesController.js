import { asyncHandler } from '../lib/asyncHandler.js';
import { getVectorTile } from '../services/tilesService.js';

// Thin controller: pull already-validated params, call the service, write
// the tile bytes (or 204 when the tile has no features). No business logic
// here.
export const getTile = asyncHandler(async (req, res) => {
  const { layer, z, x, y } = req.params;
  const tile = await getVectorTile(layer, { z, x, y });

  if (!tile || tile.length === 0) {
    res.status(204).end();
    return;
  }

  res.set('Content-Type', 'application/vnd.mapbox-vector-tile');
  // Revalidate against the ETag on each request (cheap 304 when unchanged) so a
  // re-ingest or geometry fix is never masked by a stale cached tile.
  res.set('Cache-Control', 'no-cache');
  res.status(200).send(tile);
});
