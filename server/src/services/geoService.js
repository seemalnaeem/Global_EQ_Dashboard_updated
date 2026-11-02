import { UpstreamError } from '../lib/errors.js';

// Thin client for the geo (FastAPI) service. Never swallows connection
// failures, wraps them as UpstreamError so they flow to the error handler.
const GEO_SERVICE_URL = process.env.GEO_SERVICE_URL || 'http://geo:3091';

export async function fetchGeoHealth(timeoutMs = 2000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${GEO_SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok ? 'up' : 'down';
  } catch {
    // Health checks tolerate a down dependency, that is the point of the check.
    return 'down';
  }
}

export async function fetchClusters(searchParams) {
  const qs = searchParams ? `?${searchParams}` : '';
  let res;
  try {
    res = await fetch(`${GEO_SERVICE_URL}/analytics/clusters${qs}`);
  } catch (err) {
    throw new UpstreamError(`geo service unreachable: ${err.message}`, 502);
  }
  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, body };
}

export async function fetchRasterCatalog() {
  let res;
  try {
    res = await fetch(`${GEO_SERVICE_URL}/raster/catalog`);
  } catch (err) {
    throw new UpstreamError(`geo service unreachable: ${err.message}`, 502);
  }
  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, body };
}
