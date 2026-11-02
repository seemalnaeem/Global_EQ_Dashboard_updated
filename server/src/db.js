// Shared pg pool for the earthquake database. One pool per process, reused
// by every repository. Connection string comes from env, never hardcoded.
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

pool.on('error', (err) => {
  // A connection in the idle pool went bad. Log it, do not crash the process.
  console.error('Unexpected pg pool error:', err.message);
});
