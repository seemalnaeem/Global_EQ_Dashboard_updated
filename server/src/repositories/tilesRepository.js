import { pool } from '../db.js';
import { AppError } from '../lib/errors.js';

// DB layer for GET /api/tiles/:layer/:z/:x/:y.pbf. A layer name never
// reaches SQL here until tilesService has confirmed it, exact match,
// against the imported_layers whitelist (layersService.isValidVectorLayer).
// quoteIdent()/IDENT_RE below is defense-in-depth on top of that, same
// guard used in layersRepository.

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function quoteIdent(name) {
  if (!IDENT_RE.test(name)) {
    // Should be unreachable: name comes from the whitelist check in
    // tilesService. Guards against a malformed catalog row.
    throw new AppError(`invalid layer identifier: ${name}`, 500);
  }
  return `"${name}"`;
}

// layer -> quoted, ordered non-geom column list. ogr2ogr-imported tables
// don't change shape at runtime, so one information_schema lookup per
// layer per process is enough.
const columnCache = new Map();

async function getPropertyColumns(layer) {
  if (columnCache.has(layer)) return columnCache.get(layer);

  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name <> 'geom'
     ORDER BY ordinal_position;`,
    [layer]
  );

  // Re-validated even though information_schema is not user input: defense
  // in depth before these names are interpolated into the tile query.
  const columns = rows.map((r) => r.column_name).filter((c) => IDENT_RE.test(c));

  columnCache.set(layer, columns);
  return columns;
}

// layer must already be whitelist-checked by the caller (tilesService).
// Returns the ST_AsMVT bytea as a Buffer, or null when the tile has no
// features (env doesn't intersect any row for this layer).
export async function queryTile(layer, { z, x, y }) {
  const table = quoteIdent(layer);
  const columns = await getPropertyColumns(layer);
  const propCols = columns.map((c) => `g."${c}"`).join(', ');
  const selectCols = propCols ? `, ${propCols}` : '';

  const text = `
    WITH env AS (SELECT ST_TileEnvelope($1,$2,$3) AS geom)
    SELECT ST_AsMVT(t, $4, 4096, 'geom') AS mvt
    FROM (
      SELECT ST_AsMVTGeom(ST_Transform(g.geom, 3857), env.geom, 4096, 64, true) AS geom${selectCols}
      FROM ${table} g, env
      WHERE g.geom && ST_Transform(env.geom, 4326)
    ) t;
  `;

  const { rows } = await pool.query(text, [z, x, y, layer]);
  return rows[0]?.mvt ?? null;
}
