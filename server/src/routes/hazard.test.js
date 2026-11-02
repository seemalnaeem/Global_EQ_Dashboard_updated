import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { app } from '../app.js';
import { pool } from '../db.js';

const seedRows = [
  {
    name: 'pga_2023',
    title: 'PGA Hazard 2023 (g)',
    provider: 'OpenQuake / GEM',
    attribution: 'GEM Global Seismic Hazard Map v2023.1 (PGA, 10% in 50yr)',
    min_zoom: 0,
    max_zoom: 8,
    legend: [{ label: '< 0.1', color: '#ffffb2' }],
    bounds: [-180, -85, 180, 85]
  },
  {
    name: 'pga_2026',
    title: 'PGA Hazard 2026 (g)',
    provider: 'OpenQuake / GEM',
    attribution: 'GEM Global Seismic Hazard Map v2026.1 (PGA, 10% in 50yr)',
    min_zoom: 0,
    max_zoom: 8,
    legend: [{ label: '< 0.1', color: '#ffffb2' }],
    bounds: [-180, -85, 180, 85]
  }
];

test('GET /api/hazard-layers returns the catalog with tiles_url and legend', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: seedRows }));

  const res = await request(app).get('/api/hazard-layers');

  assert.equal(res.status, 200);
  assert.equal(res.body.layers.length, 2);
  const pga2026 = res.body.layers.find((l) => l.name === 'pga_2026');
  assert.ok(pga2026);
  assert.equal(pga2026.tiles_url, '/api/hazard-tiles/pga_2026/{z}/{x}/{y}.png');
  assert.ok(Array.isArray(pga2026.legend));
});

test('GET /api/hazard-tiles/:name/:z/:x/:y.png rejects a name not in the whitelist with 404', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const res = await request(app).get('/api/hazard-tiles/not_a_real_layer/3/4/3.png');

  assert.equal(res.status, 404);
  assert.equal(res.body.status, 'error');
});

test('GET /api/hazard-tiles/:name/:z/:x/:y.png rejects a non-integer z with 400', async (t) => {
  t.mock.method(pool, 'query', async () => {
    throw new Error('should not query the database for an invalid tile coordinate');
  });

  const res = await request(app).get('/api/hazard-tiles/pga_2026/abc/4/3.png');

  assert.equal(res.status, 400);
  assert.equal(res.body.status, 'error');
});

test('GET /api/hazard-tiles/:name/:z/:x/:y.png proxies a PNG tile from the upstream host', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [
      {
        name: 'pga_2026',
        tile_url_template: 'https://maps.openquake.org/mapproxy/gshm-2026-06-04-nobg/wmts/v20260/webmercator/{z}/{x}/{y}.png'
      }
    ]
  }));

  const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, 'https://maps.openquake.org/mapproxy/gshm-2026-06-04-nobg/wmts/v20260/webmercator/3/4/3.png');
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => fakePng.buffer
    };
  });

  const res = await request(app).get('/api/hazard-tiles/pga_2026/3/4/3.png');

  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'image/png');
  assert.equal(res.headers['cache-control'], 'public, max-age=86400');
});

test('GET /api/hazard-tiles/:name/:z/:x/:y.png maps a non-ok upstream response to 502', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [
      {
        name: 'pga_2026',
        tile_url_template: 'https://maps.openquake.org/mapproxy/gshm-2026-06-04-nobg/wmts/v20260/webmercator/{z}/{x}/{y}.png'
      }
    ]
  }));

  t.mock.method(globalThis, 'fetch', async () => ({
    ok: false,
    status: 500,
    arrayBuffer: async () => new ArrayBuffer(0)
  }));

  const res = await request(app).get('/api/hazard-tiles/pga_2026/3/4/3.png');

  assert.equal(res.status, 502);
  assert.equal(res.body.status, 'error');
});
