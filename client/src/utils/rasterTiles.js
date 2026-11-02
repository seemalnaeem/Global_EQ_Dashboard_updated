// Pure helpers for building TiTiler tile URLs from a raster catalog entry
// (see /api/rasters) plus client-side color ramp controls. No fetch here,
// kept free of React so it stays easy to unit test.

// Colormaps offered in the raster panel dropdown. Any TiTiler colormap_name
// works; this is the curated set we expose in the UI.
export const COLORMAPS = ['viridis', 'magma', 'plasma', 'turbo', 'inferno', 'greys'];

export const DEFAULT_OPACITY = 0.8;

// Client-side preview stops for each curated colormap, low value first. These
// mirror (but do not replicate exactly) each colormap's real LUT closely
// enough for a recognizable ramp swatch in the panel; the actual pixel colors
// still come from TiTiler's colormap_name applied server-side per tile.
const COLORMAP_STOPS = {
  viridis: ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'],
  magma: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'],
  plasma: ['#0d0887', '#6a00a8', '#b12a90', '#e16462', '#fca636', '#f0f921'],
  turbo: ['#30123b', '#4675ed', '#1bcfd4', '#a2fc3c', '#fca338', '#7a0403'],
  inferno: ['#000004', '#420a68', '#932667', '#dd513a', '#fca50a', '#fcffa4'],
  greys: ['#ffffff', '#636363', '#000000']
};

// Built once per colormap so `colormapRampCss` returns a stable string
// reference for the same name (fine for React re-renders, not required).
export const COLORMAP_RAMPS = Object.fromEntries(
  Object.entries(COLORMAP_STOPS).map(([name, stops]) => [
    name,
    `linear-gradient(to right, ${stops.join(', ')})`
  ])
);

const FALLBACK_RAMP = 'linear-gradient(to right, #3a3f4a, #8b949e, #cfd4da)';

/**
 * CSS `linear-gradient` preview for a colormap name, for the style-trigger
 * swatch and the ramp picker grid. Falls back to a neutral gray gradient for
 * a colormap name this dashboard does not curate a preview for.
 * @param {string} name
 * @returns {string}
 */
export function colormapRampCss(name) {
  return COLORMAP_RAMPS[name] || FALLBACK_RAMP;
}

/**
 * @typedef {object} RasterCatalogEntry
 * @property {string} name
 * @property {string} title
 * @property {string} cog_path
 * @property {string} tiles_endpoint  e.g. "/tiles/cog/tiles/{z}/{x}/{y}.png"
 * @property {number} min
 * @property {number} max
 * @property {string} colormap_default
 * @property {boolean} categorical
 */

/**
 * Builds a TiTiler XYZ tile URL template for a raster catalog entry, with the
 * color ramp applied server-side per tile (colormap_name + rescale). Changing
 * these options rebuilds the URL string; it never re-fetches the COG itself.
 * @param {RasterCatalogEntry} entry
 * @param {{colormap?: string, rescaleMin?: number, rescaleMax?: number}} [options]
 * @returns {string|null}
 */
export function buildTileUrl(entry, options = {}) {
  if (!entry || !entry.tiles_endpoint || !entry.cog_path) return null;

  const colormap = options.colormap || entry.colormap_default || 'viridis';
  const rescaleMin = options.rescaleMin ?? entry.min ?? 0;
  const rescaleMax = options.rescaleMax ?? entry.max ?? 1;

  return `${entry.tiles_endpoint}?url=${entry.cog_path}&colormap_name=${colormap}&rescale=${rescaleMin},${rescaleMax}`;
}

/**
 * Builds a TiTiler XYZ tile URL that applies a DISCRETE colormap (a mapping of
 * class value -> [r,g,b,a]), for categorical hazard rasters. Unlike buildTileUrl
 * there is no colormap_name or rescale; the class-to-color mapping is exact.
 * @param {RasterCatalogEntry} entry
 * @param {Record<number, number[]>} colormap  e.g. { 1: [26,152,80,255], ... }
 * @returns {string|null}
 */
export function buildDiscreteTileUrl(entry, colormap) {
  if (!entry || !entry.tiles_endpoint || !entry.cog_path) return null;
  const cm = encodeURIComponent(JSON.stringify(colormap));
  return `${entry.tiles_endpoint}?url=${entry.cog_path}&colormap=${cm}`;
}

// Sensible default control state for a raster catalog entry, used to seed the
// raster panel when the catalog first loads.
export function defaultRasterControls(entry) {
  return {
    visible: false,
    opacity: DEFAULT_OPACITY,
    colormap: entry?.colormap_default || 'viridis',
    rescaleMin: entry?.min ?? 0,
    rescaleMax: entry?.max ?? 1
  };
}
