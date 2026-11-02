// Display-only formatting helpers. Never mutate the source value; timestamps
// arrive UTC and are only reformatted here for the UI.

export function formatUtc(isoString) {
  if (!isoString) return 'unknown time';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'unknown time';
  return date.toLocaleString(undefined, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

export function formatNumber(value, unit = '') {
  return value === null || value === undefined ? 'unknown' : `${value}${unit}`;
}
