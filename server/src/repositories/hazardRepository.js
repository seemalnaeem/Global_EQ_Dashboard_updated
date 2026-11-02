import { pool } from '../db.js';

// DB layer for the hazard_layers catalog (external OpenQuake/GEM tile
// sources proxied by the server, never queried with user input directly:
// getHazardLayer takes a :name path param but passes it as a parameterized
// value, never string-concatenated into SQL).

export async function listHazardLayers() {
  const { rows } = await pool.query(
    `SELECT name, title, provider, attribution, min_zoom, max_zoom, legend, bounds
     FROM hazard_layers
     ORDER BY name;`
  );
  return rows;
}

export async function getHazardLayer(name) {
  const { rows } = await pool.query(
    `SELECT name, title, provider, attribution, tile_url_template, min_zoom, max_zoom, legend, bounds
     FROM hazard_layers
     WHERE name = $1;`,
    [name]
  );
  return rows[0] ?? null;
}
