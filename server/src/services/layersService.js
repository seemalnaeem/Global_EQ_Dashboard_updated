import {
  listVectorLayers,
  countVectorLayers,
  getVectorLayerNames,
  queryLayerFeatureCollection
} from '../repositories/layersRepository.js';
import { NotFoundError } from '../lib/errors.js';

// Business logic for /api/layers. This is the security boundary for
// GET /api/layers/:name: the requested name is only ever passed to the
// repository (and thus into SQL) once it is confirmed, exact match, against
// imported_layers.name (kind='vector').

export async function listLayers({ limit, offset }) {
  const [layers, total] = await Promise.all([
    listVectorLayers({ limit, offset }),
    countVectorLayers()
  ]);
  return { layers, total, limit, offset };
}

export async function getLayerFeatures(name, { bbox, simplify, limit }) {
  if (!(await isValidVectorLayer(name))) {
    throw new NotFoundError(`unknown layer: ${name}`);
  }
  return queryLayerFeatureCollection(name, { bbox, simplify, limit });
}

// Shared whitelist check: true only if `name` is an exact match against
// imported_layers.name (kind='vector'). Used by this service and by
// tilesService (GET /api/tiles/:layer/...) so the whitelist source and the
// membership check live in one place.
export async function isValidVectorLayer(name) {
  const names = await getVectorLayerNames();
  return names.includes(name);
}
