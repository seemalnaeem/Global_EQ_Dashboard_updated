import { asyncHandler } from '../lib/asyncHandler.js';
import { listQuakes } from '../services/quakesService.js';

// Thin controller: pulls the already-validated query, calls the service,
// returns the response. No business logic here.
export const getQuakes = asyncHandler(async (req, res) => {
  const result = await listQuakes(req.query);
  res.json(result);
});
