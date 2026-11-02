import { isValidVectorLayer } from './layersService.js';
import { queryTile } from '../repositories/tilesRepository.js';
import { NotFoundError } from '../lib/errors.js';

// Business logic for GET /api/tiles/:layer/:z/:x/:y.pbf. Reuses
// layersService's imported_layers (kind='vector') whitelist check: a table
// name never reaches SQL until it is confirmed, exact match, against it.

export async function getVectorTile(layer, { z, x, y }) {
  if (!(await isValidVectorLayer(layer))) {
    throw new NotFoundError(`unknown layer: ${layer}`);
  }
  return queryTile(layer, { z, x, y });
}
