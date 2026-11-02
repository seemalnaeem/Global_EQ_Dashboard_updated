import { asyncHandler } from '../lib/asyncHandler.js';
import { fetchRasterCatalog } from '../services/geoService.js';

// Thin proxy: forwards the geo service's raster catalog response and status
// code unchanged. Connection failures surface as 502 via UpstreamError
// (see services/geoService.js), never swallowed.
export const getRasters = asyncHandler(async (req, res) => {
  const { status, body } = await fetchRasterCatalog();
  res.status(status).json(body);
});
