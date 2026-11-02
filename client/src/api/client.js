// Typed fetch wrapper. Relative paths only (/api, /geo) so the app stays
// IP-independent; Vite (dev) or the container proxy handles routing.
// Never inline fetch() calls outside this module.
import { normalizeQuakeCollection } from '../utils/quake.js';

const API_BASE = '/api';

async function apiGet(path, params) {
  const query = params
    ? '?' + new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
      ).toString()
    : '';
  const res = await fetch(`${API_BASE}${path}${query}`);
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      // response had no readable body, keep detail empty
    }
    throw new Error(`API ${path} failed: ${res.status} ${res.statusText} ${detail}`.trim());
  }
  return res.json();
}

/** @returns {Promise<{status: string, [key: string]: unknown}>} */
export async function getHealth() {
  return apiGet('/health');
}

/**
 * @param {{minMagnitude?: number, maxDepth?: number, since?: string, bbox?: string, from?: string, to?: string}} filters
 *   `from`/`to` are ISO 8601 UTC timestamps bounding `occurred_at`; both are
 *   forwarded as-is (omitted when null/undefined) so the server does the
 *   actual date filtering.
 * @returns {Promise<{quakes: import('../utils/quake.js').Quake[], total: number}>}
 *   `quakes` is capped at the query limit; `total` is the full matched count
 *   from the server (so the UI can say "showing N of total").
 */
export async function getQuakes(filters = {}) {
  const payload = await apiGet('/quakes', filters);
  const quakes = normalizeQuakeCollection(payload);
  const total = typeof payload?.total === 'number' ? payload.total : quakes.length;
  return { quakes, total };
}

/**
 * Catalog of toggleable vector layers (fault_lines, tectonic_boundaries,
 * tectonic_points, ...). Each entry describes a layer by name; fetch the
 * geometry itself with getLayer(name).
 * @returns {Promise<Array<{name: string, title?: string, type?: string}>>}
 */
export async function getLayers() {
  const payload = await apiGet('/layers');
  return Array.isArray(payload) ? payload : (payload?.layers ?? []);
}

/**
 * @param {string} name layer name from getLayers(), e.g. "fault_lines"
 * @param {{bbox?: string}} [params]
 * @returns {Promise<GeoJSON.FeatureCollection>}
 */
export async function getLayer(name, params = {}) {
  if (!name) throw new Error('getLayer requires a layer name');
  return apiGet(`/layers/${encodeURIComponent(name)}`, params);
}

/**
 * Catalog of raster hazard overlays served through TiTiler. Each entry has
 * name, title, cog_path, tiles_endpoint, min, max, colormap_default,
 * categorical.
 * @returns {Promise<import('../utils/rasterTiles.js').RasterCatalogEntry[]>}
 */
export async function getRasters() {
  const payload = await apiGet('/rasters');
  const list = Array.isArray(payload) ? payload : (payload?.rasters ?? []);
  // Catalog min/max are per-band arrays. The UI rescales band 1, so flatten
  // to scalars at the boundary to match the rest of the client's assumptions.
  const band0 = (v) => (Array.isArray(v) ? v[0] : v);
  return list.map((entry) => ({ ...entry, min: band0(entry.min), max: band0(entry.max) }));
}

/**
 * Catalog of external seismic-hazard tile layers (OpenQuake GEM PGA), proxied
 * through our own /api/hazard-tiles endpoint. Each entry has name, title,
 * provider, attribution, legend (class color/label list), min_zoom, max_zoom,
 * bounds, and tiles_url (a /api/hazard-tiles/<name>/{z}/{x}/{y}.png template).
 * @returns {Promise<Array<object>>}
 */
export async function getHazardLayers() {
  const payload = await apiGet('/hazard-layers');
  return Array.isArray(payload) ? payload : (payload?.layers ?? []);
}
