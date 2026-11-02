import { listHazardLayers, getHazardLayer } from '../repositories/hazardRepository.js';
import { NotFoundError } from '../lib/errors.js';

// Business logic for /api/hazard-layers and /api/hazard-tiles/:name/:z/:x/:y.png.
// hazard_layers.tile_url_template (the real external host) never reaches the
// client; getHazardCatalog only ever exposes our own proxy path.

export async function getHazardCatalog() {
  const layers = await listHazardLayers();
  return layers.map((layer) => ({
    ...layer,
    tiles_url: `/api/hazard-tiles/${layer.name}/{z}/{x}/{y}.png`
  }));
}

// Looks up the layer by exact name match (the whitelist boundary for the tile
// proxy), then substitutes z/x/y into its stored template. Unknown name -> 404
// before any upstream request is attempted.
export async function getUpstreamTileUrl(name, z, x, y) {
  const layer = await getHazardLayer(name);
  if (!layer) {
    throw new NotFoundError(`unknown hazard layer: ${name}`);
  }
  return layer.tile_url_template
    .replace('{z}', z)
    .replace('{x}', x)
    .replace('{y}', y);
}
