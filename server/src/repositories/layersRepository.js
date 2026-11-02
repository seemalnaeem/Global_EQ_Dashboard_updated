import { pool } from '../db.js';
import { AppError } from '../lib/errors.js';

// DB layer for imported vector layers (tectonic_boundaries, fault_lines,
// tectonic_points, ...) catalogued in imported_layers. A table name never
// reaches SQL from raw user input: getVectorLayerNames() is the whitelist
// source of truth, layersService checks membership first, and quoteIdent()
// below is a defense-in-depth guard on top of that.

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function quoteIdent(name) {
  if (!IDENT_RE.test(name)) {
    // Should be unreachable: names come from imported_layers via the
    // whitelist check in layersService. Guards against a malformed catalog row.
    throw new AppError(`invalid layer identifier: ${name}`, 500);
  }
  return `"${name}"`;
}

export async function listVectorLayers({ limit, offset }) {
  const text = `
    SELECT name, kind, feature_count
    FROM imported_layers
    WHERE kind = 'vector'
    ORDER BY name
    LIMIT $1 OFFSET $2;
  `;
  const { rows } = await pool.query(text, [limit, offset]);
  return rows;
}

export async function countVectorLayers() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM imported_layers WHERE kind = 'vector';`
  );
  return rows[0].total;
}

// Whitelist of table names it is safe to query. Every :name from a request
// must appear in this list, exactly, before queryLayerFeatureCollection runs.
export async function getVectorLayerNames() {
  const { rows } = await pool.query(`SELECT name FROM imported_layers WHERE kind = 'vector';`);
  return rows.map((r) => r.name);
}

// name must already be whitelist-checked by the caller (layersService).
// Column names vary per imported table (ogr2ogr output), so properties use
// to_jsonb(t) - 'geom' rather than an explicit column list; that generic,
// injection-safe expression is the schema-agnostic equivalent of naming
// columns here, since the columns are not known ahead of time.
export async function queryLayerFeatureCollection(name, { bbox, simplify, limit }) {
  const table = quoteIdent(name);
  const params = [];
  let whereSql = '';

  if (bbox) {
    const i = params.length;
    params.push(bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat);
    whereSql = `WHERE t.geom && ST_MakeEnvelope($${i + 1},$${i + 2},$${i + 3},$${i + 4},4326)`;
  }

  let geomExpr = 't.geom';
  if (simplify !== undefined) {
    params.push(simplify);
    geomExpr = `ST_Simplify(t.geom, $${params.length})`;
  }

  params.push(limit);
  const limitIdx = params.length;

  const text = `
    SELECT jsonb_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(jsonb_agg(f.feature), '[]'::jsonb)
    ) AS collection
    FROM (
      SELECT jsonb_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(${geomExpr})::jsonb,
        'properties', to_jsonb(t) - 'geom'
      ) AS feature
      FROM ${table} t
      ${whereSql}
      LIMIT $${limitIdx}
    ) f;
  `;

  const { rows } = await pool.query(text, params);
  return rows[0].collection;
}
