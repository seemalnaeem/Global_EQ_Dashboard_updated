import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { app } from '../app.js';
import { pool } from '../db.js';

test('GET /api/layers/:name rejects a name not in the whitelist with 404', async (t) => {
  t.mock.method(pool, 'query', async (text) => {
    if (text.includes('imported_layers')) return { rows: [{ name: 'fault_lines' }] };
    throw new Error('should not query a feature table for a name outside the whitelist');
  });

  const res = await request(app).get('/api/layers/not_a_real_layer');

  assert.equal(res.status, 404);
  assert.equal(res.body.status, 'error');
});

test('GET /api/layers/:name returns a GeoJSON FeatureCollection for a whitelisted layer', async (t) => {
  t.mock.method(pool, 'query', async (text) => {
    if (text.includes('imported_layers')) return { rows: [{ name: 'fault_lines' }] };
    return {
      rows: [
        {
          collection: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [-122.4, 37.8],
                    [-122.5, 37.9]
                  ]
                },
                properties: { id: 1, name: 'Test Fault' }
              }
            ]
          }
        }
      ]
    };
  });

  const res = await request(app).get('/api/layers/fault_lines').query({ bbox: '-125,35,-120,40' });

  assert.equal(res.status, 200);
  assert.equal(res.body.type, 'FeatureCollection');
  assert.equal(res.body.features.length, 1);
});
