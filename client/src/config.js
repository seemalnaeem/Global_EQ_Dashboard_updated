// Shared client constants, mirroring the old portal's src/config.js but adapted
// to the new stack (data comes from /api/quakes, vector layers from MVT tiles,
// rasters from TiTiler). Kept free of React so components and map modules can
// share it.

// Default data window, relative to now. Page load and Clear both read this so
// they never drift. Matches the old portal (40 days, magnitude >= 3.0).
export const EQ_WINDOW_DAYS = 40;
export const EQ_MIN_MAGNITUDE = 3.0;

// Upper bound on rows fetched per query (must stay <= the server validator's
// limit max). Set high so a filter shows as many in-range events as the map can
// draw responsively; the status line reports "showing N of total" when a range
// matches more than this. Raise both here and in quakesValidator.js together.
export const EQ_QUERY_LIMIT = 10000;

// Mapbox base style and opening camera, matching the old flat map.
export const MAP_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12';
export const MAP_CENTER = [70.447303, 30.753574];

// Globe atmosphere/space styling. Shared by the main map and the PGA compare
// overlay so both show the same space background.
export const MAP_FOG = {
  color: 'rgb(65, 95, 128)',
  'high-color': 'rgb(46, 62, 97)',
  'horizon-blend': 0.02,
  'space-color': 'rgb(14, 37, 50)',
  'star-intensity': 0.6
};

// Circle paint for the quake layer. The GeoJSON property is `magnitude` (see
// utils/quake.js quakesToFeatureCollection). Color ramp matches the legend.
export const EQ_MAGNITUDE_COLOR = [
  'case',
  ['==', ['get', 'magnitude'], null],
  'rgb(116, 175, 116)',
  [
    'step',
    ['get', 'magnitude'],
    'rgb(116, 175, 116)',
    4.1, 'rgb(44, 193, 204)',
    5, 'rgb(216, 146, 17)',
    6, 'rgb(139, 43, 43)'
  ]
];

export const EQ_CIRCLE_PAINT = {
  'circle-radius': ['interpolate', ['linear'], ['coalesce', ['get', 'magnitude'], 0], 0.5, 1.5, 6, 5],
  'circle-color': EQ_MAGNITUDE_COLOR,
  'circle-opacity': 1,
  'circle-stroke-color': '#000000',
  'circle-stroke-width': 0.5
};

export const EQ_LABEL_LAYOUT = {
  'text-field': ['to-string', ['coalesce', ['get', 'magnitude'], '']],
  'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
  'text-size': 12,
  'text-offset': [0, 1.5],
  'text-anchor': 'top'
};

export const EQ_LABEL_PAINT = {
  'text-color': EQ_MAGNITUDE_COLOR,
  'text-halo-color': '#000000',
  'text-halo-width': 1
};

// Table row background by magnitude (buckets at 0.6 alpha), from the old
// earthquakeFormat.js getColorByMagnitude.
export function rowColorByMagnitude(mag) {
  if (mag === null || mag === undefined || Number.isNaN(mag)) return 'transparent';
  if (mag >= 6.1) return 'rgba(138, 73, 73, 0.6)';
  if (mag >= 5.1) return 'rgba(216, 146, 17, 0.6)';
  if (mag >= 4.1) return 'rgba(44, 193, 204, 0.6)';
  return 'rgb(116, 175, 116)';
}

// Chart point color by magnitude, from the old chart.js.
export function chartColorByMagnitude(mag) {
  if (mag >= 6.1) return 'rgb(139, 43, 43)';
  if (mag >= 5.1) return 'rgb(216, 146, 17)';
  if (mag >= 4.1) return 'rgb(44, 193, 204)';
  return 'rgb(116, 175, 116)';
}

// Fixed 5-class hazard palette (low to high, green to red) and per-raster class
// legend, matching the old portal. These rasters are categorical (classes 1..5),
// so they render with this discrete colormap rather than a continuous ramp.
const HAZARD_COLORMAP = {
  1: [26, 152, 80, 255],    // Very Low   (green)
  2: [166, 217, 106, 255],  // Low
  3: [255, 255, 191, 255],  // Moderate   (pale yellow)
  4: [253, 174, 97, 255],   // High       (orange)
  5: [215, 25, 28, 255]     // Very High  (red)
};
const HAZARD_HEX = ['#1a9850', '#a6d96a', '#ffffbf', '#fdae61', '#d7191c'];

export const RASTER_HAZARD = {
  ls_hazard_map: {
    title: 'Landslide Hazard',
    colormap: HAZARD_COLORMAP,
    legend: [
      { label: 'Very Low', color: HAZARD_HEX[0] },
      { label: 'Low', color: HAZARD_HEX[1] },
      { label: 'Moderate', color: HAZARD_HEX[2] },
      { label: 'High', color: HAZARD_HEX[3] },
      { label: 'Very High', color: HAZARD_HEX[4] }
    ]
  },
  pga_hazard_world: {
    title: 'PGA Hazard (g)',
    colormap: HAZARD_COLORMAP,
    legend: [
      { label: 'Very Low (0.001-0.054 g)', color: HAZARD_HEX[0] },
      { label: 'Low (0.054-0.161 g)', color: HAZARD_HEX[1] },
      { label: 'Moderate (0.161-0.321 g)', color: HAZARD_HEX[2] },
      { label: 'High (0.321-0.588 g)', color: HAZARD_HEX[3] },
      { label: 'Very High (0.588-1.944 g)', color: HAZARD_HEX[4] }
    ]
  },
  // Continuous slab depth (km) classed into 5 bins with the exact colors from
  // data/Slab_Depth/Key.png. Uses a TiTiler interval colormap: each
  // [[min,max],[r,g,b,a]] maps a depth range to a color (no rescale needed).
  slab_depth: {
    title: 'Slab Depth (km)',
    colormap: [
      [[0, 20], [0, 97, 0, 255]],
      [[20, 50], [122, 171, 0, 255]],
      [[50, 100], [255, 255, 0, 255]],
      [[100, 150], [255, 153, 0, 255]],
      [[150, 700], [255, 34, 0, 255]]
    ],
    legend: [
      { label: 'Very Shallow (0-20)', color: '#006100' },
      { label: 'Shallow (20-50)', color: '#7aab00' },
      { label: 'Intermediate (50-100)', color: '#ffff00' },
      { label: 'Deep (100-150)', color: '#ff9900' },
      { label: 'Very Deep (150-690)', color: '#ff2200' }
    ]
  }
};

// CSS gradient preview of a hazard legend (for the panel swatch).
export function hazardGradientCss(hazard) {
  return `linear-gradient(to right, ${hazard.legend.map((c) => c.color).join(', ')})`;
}

// Rolling window for the "Last 24 Hours" pulse.
export const PULSE_24H_WINDOW_MS = 24 * 60 * 60 * 1000;

// ISO date (YYYY-MM-DD) for `days` ago, UTC. Mirrors the old isoDaysAgo.
export function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}
