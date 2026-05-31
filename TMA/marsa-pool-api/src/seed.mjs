import pg from "pg";
import { OFFICIAL_POOLS } from "./config.mjs";
import { loadEnvFile } from "./loadEnv.mjs";

loadEnvFile();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
for (const p of OFFICIAL_POOLS) {
  await client.query(
    `INSERT INTO official_pools (pool_id, name, finder_bps, treasury_address, is_active)
     VALUES ($1,$2,$3,$4,true)
     ON CONFLICT (pool_id) DO UPDATE SET
       name = EXCLUDED.name,
       finder_bps = EXCLUDED.finder_bps,
       treasury_address = EXCLUDED.treasury_address`,
    [p.pool_id, p.name, p.finder_bps, p.treasury_address],
  );
}
await client.end();
console.log("official_pools seeded");
