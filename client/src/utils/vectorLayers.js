// Maps a vector layer name from /api/layers to a Mapbox GL render type and
// paint. Kept as pure lookups so the layer panel and MapView stay in sync
// and this mapping is unit-testable without mounting the map.

const CIRCLE_LAYERS = new Set(['tectonic_points']);

// Administrative boundary layers, distinct from tectonic_boundaries (a plate
// boundary line, not an admin polygon outline). Order here is only the
// catalog-fallback ordering (see buildLayerOrder); group membership for
// panel grouping and reorder scoping uses the same array via .includes().
export const BOUNDARY_LAYER_NAMES = [
  'national_boundary',
  'provincial_boundary',
  'district_boundary',
  'tehsil_boundary'
];

export const TECTONIC_LAYER_NAMES = [
  'fault_lines',
  'tectonic_boundaries',
  'tectonic_points',
  'pacific_ring_of_fire'
];

const ADMIN_BOUNDARY_LAYERS = new Set(BOUNDARY_LAYER_NAMES);

// Non-admin polygon layers, drawn as an outline over a low-opacity fill (e.g.
// the Pacific Ring of Fire belt). Grouped under Tectonics, not Boundaries.
const POLYGON_LAYERS = new Set([...BOUNDARY_LAYER_NAMES, 'pacific_ring_of_fire', 'susceptible_zones']);

// Point layers drawn as clickable circle markers (with a popup), as opposed to
// CIRCLE_LAYERS which are drawn as text labels (plate names).
const MARKER_LAYERS = new Set(['historical_tsunamis']);

// Admin boundaries are polygons; a line layer over a polygon traces its rings,
// so we draw them as distinct colored outlines per level. Outlines (not fills)
// keep the nested hierarchy readable without muddy overlapping transparency.
const LINE_PAINT_BY_NAME = {
  fault_lines: { 'line-color': '#230606', 'line-width': 1.8 },
  tectonic_boundaries: { 'line-color': '#ff0000', 'line-width': 1.5 },
  national_boundary: { 'line-color': '#ffffff', 'line-width': 2.5 },
  provincial_boundary: { 'line-color': '#5cc8ff', 'line-width': 1.8 },
  district_boundary: { 'line-color': '#3fb0a0', 'line-width': 1 },
  tehsil_boundary: { 'line-color': '#9aa4b2', 'line-width': 0.5, 'line-opacity': 0.7 }
};
const DEFAULT_LINE_PAINT = { 'line-color': '#e05fa8', 'line-width': 1 };
const CIRCLE_PAINT = {
  'circle-radius': 4,
  'circle-color': '#f2c744',
  'circle-stroke-color': '#1b1b1b',
  'circle-stroke-width': 1
};

export function vectorLayerRenderType(name) {
  return CIRCLE_LAYERS.has(name) ? 'circle' : 'line';
}

// Icon category for the layer panel row: 'point' for circle layers, 'admin'
// for administrative boundary outlines, 'line' otherwise (faults, plate
// boundaries). Pure lookup so the panel icon stays testable and in sync.
export function vectorLayerIconKind(name) {
  if (vectorLayerRenderType(name) === 'circle' || MARKER_LAYERS.has(name)) return 'point';
  if (ADMIN_BOUNDARY_LAYERS.has(name)) return 'admin';
  return 'line';
}

export function vectorLayerPaint(name) {
  if (vectorLayerRenderType(name) === 'circle') return CIRCLE_PAINT;
  return LINE_PAINT_BY_NAME[name] || DEFAULT_LINE_PAINT;
}

// Builds the Mapbox Vector Tile URL template for a layer served via ST_AsMVT.
// The MVT source-layer name equals the layer name, so callers set both the
// tiles url (this) and source-layer to the same string.
//
// The URL is absolute, anchored to the current page origin. Mapbox GL fetches
// and parses vector tiles inside a Web Worker, where a relative path resolves
// against the worker blob base (not the page) and returns Vite's HTML fallback,
// which then fails to parse as protobuf. Using window.location.origin keeps it
// IP-independent (it follows whatever host the browser loaded from) while giving
// the worker a resolvable absolute URL.
export function buildVectorTileUrl(name) {
  const origin =
    (typeof window !== 'undefined' && window.location && window.location.origin) || '';
  return `${origin}/api/tiles/${name}/{z}/{x}/{y}.pbf`;
}

// --- Human labels and grouping (layer panel sections) ---------------------

const LAYER_LABELS = {
  national_boundary: 'National',
  provincial_boundary: 'Provincial',
  district_boundary: 'Districts',
  tehsil_boundary: 'Tehsils',
  fault_lines: 'Fault lines',
  tectonic_boundaries: 'Plate boundaries',
  tectonic_points: 'Plate points',
  pacific_ring_of_fire: 'Pacific Ring of Fire',
  historical_tsunamis: 'Historical Tsunami',
  susceptible_zones: 'Susceptible Zones'
};

// Falls back to the raw table name for a layer the catalog exposes that this
// dashboard has no curated label for yet (never blank, never throws).
export function vectorLayerLabel(name) {
  return LAYER_LABELS[name] || name;
}

// --- Draw-order geometry kind (drives style popover fields + map layers) --

// 'polygon' layers render as a fill layer under a line layer; 'line' layers
// render as a single line layer; 'point' layers render as a single circle
// layer. Distinct from vectorLayerIconKind, which is only about the panel's
// row icon and predates the fill/line polygon split.
export function vectorLayerGeometryKind(name) {
  if (CIRCLE_LAYERS.has(name)) return 'point';
  if (MARKER_LAYERS.has(name)) return 'marker';
  if (POLYGON_LAYERS.has(name)) return 'polygon';
  return 'line';
}

// The ids (in bottom-to-top draw order for this one layer) of the Mapbox GL
// layers a vector layer renders as. A polygon layer is two Mapbox layers over
// one source: fill under line. Pure lookup so the reorder effect in MapView
// can compute stacking without touching the map for the id list itself.
// Line layers decorated with directional motion arrows repeated along the line
// (fault lines, plate-boundary style: a red stroke with arrowheads following the
// line direction). Rendered as a Mapbox symbol layer over the stroke.
const ARROW_LINE_LAYERS = new Set(['fault_lines']);

export function vectorLayerHasArrows(name) {
  return ARROW_LINE_LAYERS.has(name);
}

export function vectorLayerMapLayerIds(name) {
  const kind = vectorLayerGeometryKind(name);
  if (kind === 'polygon') return [`vector-fill-${name}`, `vector-line-${name}`];
  if (kind === 'point' || kind === 'marker') return [`vector-circle-${name}`];
  if (ARROW_LINE_LAYERS.has(name)) return [`vector-line-${name}`, `vector-linearrow-${name}`];
  return [`vector-line-${name}`];
}

// --- Per-layer style (color / outline width / fill opacity) ---------------

// ~16 sober, colorblind-conscious presets for the style popover swatch row.
// Includes the layers' current default colors plus the fixed magnitude scale
// colors, so a picked preset always reads consistently with the rest of the
// dashboard.
export const PRESET_COLORS = [
  '#e05fa8',
  '#f2c744',
  '#5cc8ff',
  '#3fb0a0',
  '#9aa4b2',
  '#ffffff',
  '#2b7fd6',
  '#e8871a',
  '#d6321f',
  '#7a0c14',
  '#8e6bbf',
  '#4c8fd6',
  '#3fb950',
  '#c0362c',
  '#5c6773',
  '#1c2530'
];

// Seed style state per layer. Keeps the current line colors as defaults for
// fault_lines/tectonic_boundaries; admin boundaries get distinct default
// colors (already used as their line colors today) with a low default fill
// opacity so nested levels (national/provincial/district/tehsil) do not
// muddy each other.
const DEFAULT_STYLE_BY_NAME = {
  // Fault lines default to a very dark red (rgb(35,6,6) == #230606); hex form
  // so the color input and preset swatches stay consistent.
  fault_lines: { color: '#230606', outlineWidth: 1.8, fillOpacity: 0 },
  // Plate boundaries (tectonic plates) default to red, shown on by default.
  tectonic_boundaries: { color: '#ff0000', outlineWidth: 1.5, fillOpacity: 0 },
  tectonic_points: { color: '#f2c744', outlineWidth: 1, fillOpacity: 0 },
  // Ring of Fire belt: orange outline over a translucent orange fill.
  pacific_ring_of_fire: { color: '#ff7a00', outlineWidth: 2, fillOpacity: 0.18 },
  national_boundary: { color: '#ffffff', outlineWidth: 2.5, fillOpacity: 0.1 },
  provincial_boundary: { color: '#5cc8ff', outlineWidth: 1.8, fillOpacity: 0.1 },
  district_boundary: { color: '#3fb0a0', outlineWidth: 1, fillOpacity: 0.1 },
  tehsil_boundary: { color: '#9aa4b2', outlineWidth: 0.8, fillOpacity: 0.1 },
  // Historical tsunami events: blue triangle markers.
  historical_tsunamis: { color: '#1e90ff', outlineWidth: 3, fillOpacity: 0 },
  // Susceptible zones: purple outline over a translucent purple fill.
  susceptible_zones: { color: '#9b59b6', outlineWidth: 2, fillOpacity: 0.2 }
};
const FALLBACK_STYLE = { color: '#8b949e', outlineWidth: 1, fillOpacity: 0.1 };

// Returns a fresh object every call (never a shared reference), so callers
// can safely spread/patch it into per-layer style state.
export function defaultLayerStyle(name) {
  return { ...(DEFAULT_STYLE_BY_NAME[name] || FALLBACK_STYLE) };
}

// Maps a layer name + style state to the Mapbox paint object(s) it needs.
// Polygon layers need both a fill paint and a line paint (fill under line);
// line/point layers need only one. Missing style fields fall back to the
// fallback style so a half-populated style object never breaks rendering.
export function layerStyleToPaint(name, style) {
  const safe = { ...FALLBACK_STYLE, ...style };
  const kind = vectorLayerGeometryKind(name);

  if (kind === 'polygon') {
    return {
      fillPaint: { 'fill-color': safe.color, 'fill-opacity': safe.fillOpacity },
      linePaint: { 'line-color': safe.color, 'line-width': safe.outlineWidth }
    };
  }
  if (kind === 'point' || kind === 'marker') {
    return {
      circlePaint: {
        'circle-color': safe.color,
        // Outline width doubles as a gentle point-radius control; a "small
        // radius" per spec, not a full 1:1 mapping of the pixel slider.
        'circle-radius': Math.max(3, 2 + safe.outlineWidth),
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1
      }
    };
  }
  return { linePaint: { 'line-color': safe.color, 'line-width': safe.outlineWidth } };
}

// --- Layer order (draw order + panel row order) ----------------------------

// Canonical top-to-bottom default: tectonic features (thin geologic lines/
// points) stay visible above admin polygons; within admin boundaries, finer
// levels (tehsil) sit above coarser ones (national) so their thinner lines
// are not hidden where borders coincide. This is only the initial seed;
// users can drag-reorder within a group afterwards (see layerOrder.js).
const CANONICAL_LAYER_ORDER = [
  ...TECTONIC_LAYER_NAMES,
  'tehsil_boundary',
  'district_boundary',
  'provincial_boundary',
  'national_boundary'
];

// Builds the initial draw-order list for a fresh catalog: known layers in
// canonical order, then any layer name the catalog has that this dashboard
// does not curate a position for (future-proofing), in catalog order.
export function buildLayerOrder(catalogNames) {
  const known = new Set(catalogNames);
  const primary = CANONICAL_LAYER_ORDER.filter((name) => known.has(name));
  const extras = catalogNames.filter((name) => !CANONICAL_LAYER_ORDER.includes(name));
  return [...primary, ...extras];
}

// Merges a freshly loaded catalog into an existing order: names already
// ordered keep their position (preserves user drag-reordering across a
// catalog refresh), newly seen names are appended via buildLayerOrder.
export function mergeLayerOrder(prevOrder, catalogNames) {
  const known = new Set(catalogNames);
  const kept = prevOrder.filter((name) => known.has(name));
  const keptSet = new Set(kept);
  const additions = buildLayerOrder(catalogNames).filter((name) => !keptSet.has(name));
  return [...kept, ...additions];
}
