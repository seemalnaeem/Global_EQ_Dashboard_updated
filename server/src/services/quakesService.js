import { queryQuakesFeatureCollection, countQuakes } from '../repositories/quakesRepository.js';

// Business logic for /api/quakes. Turns validated filters into a paginated
// GeoJSON FeatureCollection and detects antimeridian-crossing bbox so the
// repository can split it into two envelopes.
export async function listQuakes(filters) {
  const { bbox, radius, minMag, maxMag, minDepth, maxDepth, from, to, limit, offset } = filters;
  const crossesAntimeridian = !!bbox && bbox.minLon > bbox.maxLon;

  const queryFilters = {
    bbox,
    crossesAntimeridian,
    radius,
    minMag,
    maxMag,
    minDepth,
    maxDepth,
    from,
    to,
    limit,
    offset
  };

  const [collection, total] = await Promise.all([
    queryQuakesFeatureCollection(queryFilters),
    countQuakes(queryFilters)
  ]);

  return { ...collection, total, limit, offset };
}
