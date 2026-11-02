import { pool } from '../db.js';

// DB layer for quakes. All queries parameterized, no string-built SQL, no
// SELECT *. Follows skills/postgis-query for bbox, radius and GeoJSON shape.

function buildWhere({ bbox, crossesAntimeridian, radius, minMag, maxMag, minDepth, maxDepth, from, to }) {
  const clauses = [];
  const params = [];

  if (bbox) {
    if (crossesAntimeridian) {
      // Split into two envelopes ORed together: [minLon,180] and [-180,maxLon].
      const i = params.length;
      params.push(bbox.minLon, bbox.minLat, 180, bbox.maxLat, -180, bbox.minLat, bbox.maxLon, bbox.maxLat);
      clauses.push(
        `(geom && ST_MakeEnvelope($${i + 1},$${i + 2},$${i + 3},$${i + 4})::geography ` +
          `OR geom && ST_MakeEnvelope($${i + 5},$${i + 6},$${i + 7},$${i + 8})::geography)`
      );
    } else {
      const i = params.length;
      params.push(bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat);
      clauses.push(`geom && ST_MakeEnvelope($${i + 1},$${i + 2},$${i + 3},$${i + 4})::geography`);
    }
  }

  if (radius) {
    const i = params.length;
    params.push(radius.lon, radius.lat, radius.radiusM);
    clauses.push(`ST_DWithin(geom, ST_MakePoint($${i + 1},$${i + 2})::geography, $${i + 3})`);
  }

  if (minMag !== undefined) {
    params.push(minMag);
    clauses.push(`magnitude >= $${params.length}`);
  }
  if (maxMag !== undefined) {
    params.push(maxMag);
    clauses.push(`magnitude <= $${params.length}`);
  }
  if (minDepth !== undefined) {
    params.push(minDepth);
    clauses.push(`depth_km >= $${params.length}`);
  }
  if (maxDepth !== undefined) {
    params.push(maxDepth);
    clauses.push(`depth_km <= $${params.length}`);
  }
  if (from !== undefined) {
    params.push(from);
    clauses.push(`occurred_at >= $${params.length}`);
  }
  if (to !== undefined) {
    params.push(to);
    clauses.push(`occurred_at <= $${params.length}`);
  }

  const sql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { sql, params };
}

export async function queryQuakesFeatureCollection(filters) {
  const { sql: whereSql, params } = buildWhere(filters);
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const text = `
    SELECT jsonb_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(jsonb_agg(f.feature), '[]'::jsonb)
    ) AS collection
    FROM (
      SELECT jsonb_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(geom::geometry)::jsonb,
        'properties', jsonb_build_object(
          'id', id,
          'magnitude', magnitude,
          'depth_km', depth_km,
          'occurred_at', occurred_at,
          'place', place,
          'source', source
        )
      ) AS feature
      FROM quakes
      ${whereSql}
      ORDER BY occurred_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    ) f;
  `;

  const values = [...params, filters.limit, filters.offset];
  const { rows } = await pool.query(text, values);
  return rows[0].collection;
}

export async function countQuakes(filters) {
  const { sql: whereSql, params } = buildWhere(filters);
  const text = `SELECT COUNT(*)::int AS total FROM quakes ${whereSql};`;
  const { rows } = await pool.query(text, params);
  return rows[0].total;
}
