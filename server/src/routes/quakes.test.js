import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { app } from '../app.js';
import { pool } from '../db.js';

test('GET /api/quakes rejects a malformed bbox with 400', async () => {
  const res = await request(app).get('/api/quakes').query({ bbox: '1,2,3' });
  assert.equal(res.status, 400);
  assert.equal(res.body.status, 'error');
});

test('GET /api/quakes returns a GeoJSON FeatureCollection on the happy path', async (t) => {
  t.mock.method(pool, 'query', async (text) => {
    if (text.includes('COUNT(*)')) return { rows: [{ total: 1 }] };
    return {
      rows: [
        {
          collection: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [-122.4, 37.8] },
                properties: {
                  id: 1,
                  magnitude: 4.5,
                  depth_km: 10,
                  occurred_at: '2026-01-01T00:00:00Z',
                  place: 'Test',
                  source: 'usgs'
                }
              }
            ]
          }
        }
      ]
    };
  });

  const res = await request(app).get('/api/quakes').query({ min_mag: 4, limit: 10 });

  assert.equal(res.status, 200);
  assert.equal(res.body.type, 'FeatureCollection');
  assert.equal(res.body.total, 1);
  assert.equal(res.body.features.length, 1);
});

test('GET /api/quakes accepts max_mag, min_depth, max_depth on the happy path', async (t) => {
  t.mock.method(pool, 'query', async (text) => {
    if (text.includes('COUNT(*)')) return { rows: [{ total: 0 }] };
    return { rows: [{ collection: { type: 'FeatureCollection', features: [] } }] };
  });

  const res = await request(app)
    .get('/api/quakes')
    .query({ min_mag: 2, max_mag: 6, min_depth: 0, max_depth: 50 });

  assert.equal(res.status, 200);
  assert.equal(res.body.type, 'FeatureCollection');
  assert.equal(res.body.total, 0);
});

test('GET /api/quakes rejects min_mag > max_mag with 400', async () => {
  const res = await request(app).get('/api/quakes').query({ min_mag: 6, max_mag: 4 });
  assert.equal(res.status, 400);
  assert.equal(res.body.status, 'error');
});

test('GET /api/quakes rejects min_depth > max_depth with 400', async () => {
  const res = await request(app).get('/api/quakes').query({ min_depth: 100, max_depth: 10 });
  assert.equal(res.status, 400);
  assert.equal(res.body.status, 'error');
});

test('GET /api/quakes builds parameterized magnitude and depth clauses in SQL', async (t) => {
  let capturedText = '';
  t.mock.method(pool, 'query', async (text) => {
    capturedText = text;
    if (text.includes('COUNT(*)')) return { rows: [{ total: 0 }] };
    return { rows: [{ collection: { type: 'FeatureCollection', features: [] } }] };
  });

  await request(app).get('/api/quakes').query({ max_mag: 6, min_depth: 0, max_depth: 50 });

  assert.match(capturedText, /magnitude <= \$\d+/);
  assert.match(capturedText, /depth_km >= \$\d+/);
  assert.match(capturedText, /depth_km <= \$\d+/);
});
