import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { getHazardCatalog, getUpstreamTileUrl } from '../services/hazardService.js';

// Thin controllers: no business logic, just params in / response out. All
// hazard-layer lookups and URL building live in services/hazardService.js.

export const getHazardLayers = asyncHandler(async (req, res) => {
  const layers = await getHazardCatalog();
  res.json({ layers });
});

const TILE_FETCH_TIMEOUT_MS = 15000;

// Proxies one PNG tile from the upstream OpenQuake/GEM host so the client
// never calls out to the external host directly. The upstream URL is built
// server-side from a whitelisted template, never from raw request input.
export const getHazardTile = asyncHandler(async (req, res) => {
  const { name, z, x, y } = req.params;
  const upstreamUrl = await getUpstreamTileUrl(name, z, x, y);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TILE_FETCH_TIMEOUT_MS);

  let upstreamRes;
  try {
    upstreamRes = await fetch(upstreamUrl, { signal: controller.signal });
  } catch (err) {
    throw new AppError('hazard tile upstream error', 502, { cause: err.message });
  } finally {
    clearTimeout(timeout);
  }

  if (upstreamRes.status === 204) {
    res.status(204).end();
    return;
  }

  if (!upstreamRes.ok) {
    throw new AppError('hazard tile upstream error', 502);
  }

  const buffer = Buffer.from(await upstreamRes.arrayBuffer());
  if (buffer.length === 0) {
    res.status(204).end();
    return;
  }

  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'public, max-age=86400');
  res.status(200).send(buffer);
});
