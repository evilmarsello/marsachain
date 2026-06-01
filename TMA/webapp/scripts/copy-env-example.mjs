import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const webapp = path.join(root, "..");
const target = path.join(webapp, ".env");
const example = path.join(webapp, ".env.example");

if (fs.existsSync(target)) {
  console.log(".env already exists — not overwriting. Delete it manually if you need a fresh copy.");
  process.exit(0);
}
if (!fs.existsSync(example)) {
  console.error("Missing .env.example");
  process.exit(1);
}
fs.copyFileSync(example, target);
console.log("Created .env from .env.example.");
console.log("IMPORTANT: edit webapp/.env and set a real node IP/domain in VITE_FULLNODE_PROXY_TARGET.");
console.log("Do not leave YOUR_VPS_IP — that hostname does not exist in DNS (ENOTFOUND).");
