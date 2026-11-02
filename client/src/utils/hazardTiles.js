// Absolute XYZ tile URL template for a seismic-hazard layer, proxied through
// our own server (/api/hazard-tiles/<name>/{z}/{x}/{y}.png). Absolute (origin
// prefixed) for the same reason as buildVectorTileUrl: Mapbox GL fetches tiles
// in a Web Worker where a relative path would not resolve. {z}/{x}/{y} stay
// literal for Mapbox to substitute.
export function buildHazardTileUrl(name) {
  const origin =
    (typeof window !== 'undefined' && window.location && window.location.origin) || '';
  return `${origin}/api/hazard-tiles/${name}/{z}/{x}/{y}.png`;
}
