// Per-layer attribute config for the boundary feature info card, plus pure
// formatting helpers. Fields listed here are the only ones ever shown; a
// feature missing a configured field just skips that row (rules/guardrails.md
// data honesty: never fabricate a value).

// Real fields only, per the four boundary layers' actual MVT properties.
export const BOUNDARY_ATTRIBUTE_CONFIG = {
  national_boundary: { nameField: 'admin01_na', subtitleField: null, detailFields: [] },
  provincial_boundary: { nameField: 'province', subtitleField: null, detailFields: [] },
  district_boundary: {
    nameField: 'districts',
    subtitleField: 'province',
    detailFields: ['division', 'country', 'population']
  },
  tehsil_boundary: {
    nameField: 'tehsil',
    subtitleField: 'district',
    detailFields: ['province', 'area_sq_km']
  },
  fault_lines: {
    nameField: 'name',
    subtitleField: 'slip_type',
    detailFields: ['catalog_na']
  }
};

// ogr2ogr/PostGIS bookkeeping columns that are never useful to show a user,
// even if a future config accidentally listed one.
export const HIDDEN_FIELDS = new Set([
  'ogc_fid',
  'id',
  'gid',
  'objectid',
  'shape_leng',
  'shape_le_1',
  'shape_area'
]);

const LABEL_OVERRIDES = {
  division: 'Division',
  country: 'Country',
  province: 'Province',
  population: 'Population',
  area_sq_km: 'Area',
  district: 'District',
  districts: 'District',
  tehsil: 'Tehsil',
  slip_type: 'Slip type',
  catalog_na: 'Catalog'
};

// Common short-code-ish property names, checked in priority order. Only
// surfaces a value the feed actually provided; never fabricates one.
const CODE_CANDIDATE_KEYS = ['code', 'iso_code', 'iso2', 'iso3', 'hasc', 'hasc_1', 'admin_code'];

export function getBoundaryAttributeConfig(name) {
  return BOUNDARY_ATTRIBUTE_CONFIG[name] || null;
}

// key -> display label. Explicit overrides win; otherwise title-cases the
// snake_case key so an unconfigured field never renders raw (e.g. "area_sq_km").
export function humanizeFieldLabel(key) {
  if (LABEL_OVERRIDES[key]) return LABEL_OVERRIDES[key];
  return key.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function isPresent(value) {
  return value !== null && value !== undefined && value !== '';
}

// key + raw value -> display string, or null if there is nothing to show.
// population -> integer with thousands separators; area_sq_km -> one decimal
// + " km2". Everything else is just stringified, never zero-filled.
export function formatAttributeValue(key, value) {
  if (!isPresent(value)) return null;
  if (key === 'population') {
    const num = Number(value);
    return Number.isFinite(num) ? Math.round(num).toLocaleString('en-US') : String(value);
  }
  if (key === 'area_sq_km') {
    const num = Number(value);
    return Number.isFinite(num) ? `${num.toFixed(1)} km2` : String(value);
  }
  return String(value);
}

// Scans for a short code-like field the feed actually provided. Returns null
// (never a made-up value) if none of the candidate keys are present.
export function findShortCode(properties) {
  if (!properties) return null;
  for (const key of CODE_CANDIDATE_KEYS) {
    if (isPresent(properties[key])) return String(properties[key]);
  }
  return null;
}

/**
 * Builds the boundary info card content from a layer name + a real MVT
 * feature's properties. Returns null when the layer has no attribute config
 * or there are no properties at all (nothing honest to show).
 * @param {string} name layer name, e.g. "district_boundary"
 * @param {Record<string, unknown>} properties
 */
export function buildFeatureCard(name, properties) {
  const config = getBoundaryAttributeConfig(name);
  if (!config || !properties) return null;

  const rawTitle = properties[config.nameField];
  const rawSubtitle = config.subtitleField ? properties[config.subtitleField] : null;

  const rows = (config.detailFields || [])
    .filter((field) => !HIDDEN_FIELDS.has(field))
    .filter((field) => isPresent(properties[field]))
    .map((field) => ({
      key: field,
      label: humanizeFieldLabel(field),
      value: formatAttributeValue(field, properties[field])
    }))
    .filter((row) => row.value !== null);

  return {
    layerName: name,
    title: isPresent(rawTitle) ? String(rawTitle) : 'Unnamed feature',
    subtitle: isPresent(rawSubtitle) ? String(rawSubtitle) : null,
    rows,
    code: findShortCode(properties)
  };
}
