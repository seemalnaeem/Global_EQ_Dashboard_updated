import { asyncHandler } from '../lib/asyncHandler.js';
import { fetchClusters } from '../services/geoService.js';

// Thin proxy: forwards query params to the geo service and passes its
// status code straight through (including 501 not-implemented).
export const getClusters = asyncHandler(async (req, res) => {
  const searchParams = new URLSearchParams(req.query).toString();
  const { status, body } = await fetchClusters(searchParams);
  res.status(status).json(body);
});
