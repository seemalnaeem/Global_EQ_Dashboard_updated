// Pure helpers for quake data. Kept free of React and fetch so they are
// easy to unit test (see quake.test.js).

// Fixed, colorblind-safe magnitude scale (rules/geospatial.md). Not data-relative.
export function magnitudeColor(magnitude) {
  if (magnitude === null || magnitude === undefined || Number.isNaN(magnitude)) {
    return '#9aa4b2'; // unknown magnitude, gray
  }
  if (magnitude < 4.1) return '#82b183'; // green, 4.0 or less (includes < 3.0)
  if (magnitude < 5.1) return '#3fbdd1'; // cyan, 4.1 - 5.0
  if (magnitude < 6.1) return '#e8a020'; // amber, 5.1 - 6.0
  return '#a12f2f'; // dark red, >= 6.1
}

// Radius scales gently with magnitude so unknown/small quakes stay visible
// without dominating the map. Scale bumped slightly so the 6.1+ tier reads
// clearly larger on the map.
export function magnitudeRadius(magnitude) {
  if (magnitude === null || magnitude === undefined || Number.isNaN(magnitude)) {
    return 4;
  }
  return Math.max(3, magnitude * 2.6);
}

// Mapbox GL expressions that mirror magnitudeColor/magnitudeRadius exactly, so
// the circle layer paint stays in sync with the legend and the pure functions
// above. Unknown/missing magnitude is handled first (gray); every real value
// below 4.1 is green.
export const magnitudeCircleColorExpression = [
  'case',
  ['==', ['get', 'magnitude'], null],
  '#9aa4b2', // unknown -> gray
  [
    'step',
    ['get', 'magnitude'],
    '#82b183', // 4.0 or less (includes < 3.0) -> green
    4.1,
    '#3fbdd1', // 4.1 - 5.0
    5.1,
    '#e8a020', // 5.1 - 6.0
    6.1,
    '#a12f2f' // >= 6.1
  ]
];

export const magnitudeCircleRadiusExpression = [
  'case',
  ['==', ['get', 'magnitude'], null],
  4,
  ['max', 3, ['*', ['get', 'magnitude'], 2.6]]
];

// Longitude can arrive as 0..360 from some feeds. Normalize to -180..180
// (rules/geospatial.md antimeridian note) before it ever reaches Mapbox.
export function normalizeLon(lon) {
  let normalized = lon;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

// GeoJSON order is [lon, lat], which is Mapbox's native order too, so there is
// no axis swap here (unlike Leaflet). We still validate shape and normalize
// longitude across the antimeridian at this boundary.
export function normalizeCoordinates(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [lon, lat] = coordinates;
  if (typeof lon !== 'number' || typeof lat !== 'number') return null;
  if (Number.isNaN(lon) || Number.isNaN(lat)) return null;
  return [normalizeLon(lon), lat];
}

// Normalizes one GeoJSON Feature (or a flat record shape) into the shape the
// UI renders. Magnitude and depth are nullable, never zero-filled.
export function normalizeQuake(raw) {
  if (!raw) return null;

  const geometry = raw.geometry || raw.geom;
  const properties = raw.properties || raw;
  const coordinates = geometry && geometry.coordinates;
  const lonLat = normalizeCoordinates(coordinates);
  if (!lonLat) return null;

  const magnitude =
    typeof properties.magnitude === 'number' ? properties.magnitude : null;
  const depthKm =
    typeof properties.depth_km === 'number' ? properties.depth_km : null;

  return {
    id: raw.id ?? properties.id ?? properties.source_id ?? `${lonLat[0]},${lonLat[1]}`,
    sourceId: properties.source_id ?? null,
    source: properties.source ?? null,
    place: properties.place ?? null,
    magnitude,
    depthKm,
    occurredAt: properties.occurred_at ?? null,
    coordinates: lonLat
  };
}

// Accepts either a GeoJSON FeatureCollection or a plain array of features
// / records, since the server contract may return either shape.
export function normalizeQuakeCollection(payload) {
  const features = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.features)
      ? payload.features
      : [];
  return features.map(normalizeQuake).filter(Boolean);
}

// Builds a plain GeoJSON FeatureCollection from normalized quakes, for use as
// a Mapbox GeoJSON source. Coordinates are already [lon, lat].
export function quakesToFeatureCollection(quakes) {
  return {
    type: 'FeatureCollection',
    features: (quakes || []).map((quake) => ({
      type: 'Feature',
      id: quake.id,
      geometry: { type: 'Point', coordinates: quake.coordinates },
      properties: {
        id: quake.id,
        sourceId: quake.sourceId,
        source: quake.source,
        place: quake.place,
        magnitude: quake.magnitude,
        depthKm: quake.depthKm,
        occurredAt: quake.occurredAt
      }
    }))
  };
}
