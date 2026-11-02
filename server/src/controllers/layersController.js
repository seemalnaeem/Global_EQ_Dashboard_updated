import { asyncHandler } from '../lib/asyncHandler.js';
import { listLayers, getLayerFeatures } from '../services/layersService.js';

// Thin controllers: pull already-validated input, call the service, return
// the response. No business logic here.

export const getLayers = asyncHandler(async (req, res) => {
  const result = await listLayers(req.query);
  res.json(result);
});

export const getLayerByName = asyncHandler(async (req, res) => {
  const collection = await getLayerFeatures(req.params.name, req.query);
  res.json(collection);
});
