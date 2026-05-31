import pg from "pg";

const { Pool } = pg;

let pool = null;

export function dbEnabled() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getPool() {
  if (!dbEnabled()) return null;
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export async function query(text, params = []) {
  const p = getPool();
  if (!p) throw new Error("database_not_configured");
  return p.query(text, params);
}

export async function getIndexerState(key) {
  const r = await query("SELECT value FROM indexer_state WHERE key = $1", [key]);
  return r.rows[0]?.value ?? null;
}

export async function setIndexerState(key, value) {
  await query(
    `INSERT INTO indexer_state (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, String(value)],
  );
}
