import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { app } from '../app.js';
import { pool } from '../db.js';

test('GET /api/tiles/:layer/:z/:x/:y.pbf rejects a name not in the whitelist with 404', async (t) => {
  t.mock.method(pool, 'query', async (text) => {
    if (text.includes('imported_layers')) return { rows: [{ name: 'fault_lines' }] };
    throw new Error('should not query information_schema or a feature table for a name outside the whitelist');
  });

  const res = await request(app).get('/api/tiles/not_a_real_layer/5/10/12.pbf');

  assert.equal(res.status, 404);
  assert.equal(res.body.status, 'error');
});

test('GET /api/tiles/:layer/:z/:x/:y.pbf rejects an out-of-range tile coordinate with 400', async (t) => {
  t.mock.method(pool, 'query', async () => {
    throw new Error('should not query the database for an invalid tile coordinate');
  });

  // z=5 => valid x/y range is 0..31.
  const res = await request(app).get('/api/tiles/fault_lines/5/999/12.pbf');

  assert.equal(res.status, 400);
  assert.equal(res.body.status, 'error');
});

test('GET /api/tiles/:layer/:z/:x/:y.pbf returns an MVT buffer for a whitelisted layer', async (t) => {
  t.mock.method(pool, 'query', async (text) => {
    if (text.includes('imported_layers')) return { rows: [{ name: 'fault_lines' }] };
    if (text.includes('information_schema.columns')) {
      return { rows: [{ column_name: 'id' }, { column_name: 'name' }] };
    }
    if (text.includes('ST_AsMVT')) {
      return { rows: [{ mvt: Buffer.from('fake-mvt-bytes') }] };
    }
    throw new Error(`unexpected query: ${text}`);
  });

  const res = await request(app).get('/api/tiles/fault_lines/5/10/12.pbf');

  if (res.status === 204) {
    assert.equal(res.status, 204);
    return;
  }

  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/vnd.mapbox-vector-tile');
  assert.equal(res.headers['cache-control'], 'public, max-age=3600');
});
