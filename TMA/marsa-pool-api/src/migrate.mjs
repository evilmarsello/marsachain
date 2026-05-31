import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadEnvFile } from "./loadEnv.mjs";

loadEnvFile();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "..", "schema.sql");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const migrationsDir = path.join(__dirname, "..", "migrations");
const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(fs.readFileSync(schemaPath, "utf8"));
if (fs.existsSync(migrationsDir)) {
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    await client.query(fs.readFileSync(path.join(migrationsDir, f), "utf8"));
    console.log("migration applied:", f);
  }
}
await client.end();
console.log("schema applied");
