// Pure helpers for the earthquake filter, ported from the old portal's
// filters.js + config.js so the behavior stays identical. Kept free of React
// and fetch for easy unit testing.
import { EQ_MIN_MAGNITUDE, EQ_QUERY_LIMIT, EQ_WINDOW_DAYS, isoDaysAgo } from '../config.js';

// date input value ("YYYY-MM-DD") -> UTC start-of-day / end-of-day ISO string.
export function dayStartIso(dateValue) {
  return `${dateValue}T00:00:00.000Z`;
}
export function dayEndIso(dateValue) {
  return `${dateValue}T23:59:59.999Z`;
}

// ISO "YYYY-MM-DD" -> display "MM/DD/YYYY" (month/day/year, matching the USGS
// table). Returns '' for empty or malformed input.
export function isoToUsDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) return '';
  return `${match[2]}/${match[3]}/${match[1]}`;
}

// Display "MM/DD/YYYY" (also accepts single-digit M/D) -> ISO "YYYY-MM-DD".
// Returns '' when the text is not a complete, real calendar date, so partial
// typing (e.g. "10/") simply leaves the bound unset rather than guessing.
export function usDateToIso(text) {
  const match = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(text || '');
  if (!match) return '';
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  const iso = `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // Reject impossible dates (02/31) by round-tripping through a UTC Date.
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return '';
  }
  return iso;
}

// The default field state: the last EQ_WINDOW_DAYS up to today, empty
// magnitude/depth. Mirrors the old initFilterDates + empty ranges.
export function defaultFilterFields() {
  return {
    fromDate: isoDaysAgo(EQ_WINDOW_DAYS),
    toDate: isoDaysAgo(0),
    magMin: '',
    magMax: '',
    depthMin: '',
    depthMax: ''
  };
}

// Reads a numeric field, returning null for an empty string.
function num(raw) {
  return raw === '' || raw === null || raw === undefined ? null : Number(raw);
}

// Validates the ranges, returning an alert message (identical to the old
// portal) if inconsistent, or null when valid.
export function validateFilterFields(fields) {
  const { fromDate, toDate } = fields;
  const magMin = num(fields.magMin);
  const magMax = num(fields.magMax);
  const depthMin = num(fields.depthMin);
  const depthMax = num(fields.depthMax);

  if (fromDate && toDate && fromDate > toDate) {
    return 'Start date must be on or before the end date.';
  }
  if (magMin !== null && magMax !== null && magMin > magMax) {
    return 'Minimum magnitude must not exceed maximum magnitude.';
  }
  if (depthMin !== null && depthMax !== null && depthMin > depthMax) {
    return 'Minimum depth must not exceed maximum depth.';
  }
  return null;
}

// Builds the /api/quakes query params from the field state. Mirrors the old
// buildUSGSQueryUrl: dates only when set, min magnitude defaults to
// EQ_MIN_MAGNITUDE, max magnitude and depth bounds only when set. Undefined
// values are dropped by the api client.
export function buildFilterParams(fields) {
  const magMin = num(fields.magMin);
  const magMax = num(fields.magMax);
  const depthMin = num(fields.depthMin);
  const depthMax = num(fields.depthMax);

  const params = {
    min_mag: magMin !== null ? magMin : EQ_MIN_MAGNITUDE,
    limit: EQ_QUERY_LIMIT
  };
  if (fields.fromDate) params.from = dayStartIso(fields.fromDate);
  if (fields.toDate) params.to = dayEndIso(fields.toDate);
  if (magMax !== null) params.max_mag = magMax;
  if (depthMin !== null) params.min_depth = depthMin;
  if (depthMax !== null) params.max_depth = depthMax;
  return params;
}

// The default applied filter (last EQ_WINDOW_DAYS, min magnitude 3.0). Used by
// App on first load and by the filter's Clear action.
export function defaultFilterParams() {
  return buildFilterParams(defaultFilterFields());
}
