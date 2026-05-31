import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const webapp = path.join(root, "..");
const target = path.join(webapp, ".env");
const example = path.join(webapp, ".env.example");

if (fs.existsSync(target)) {
  console.log(".env уже существует — не перезаписываю. Удалите файл вручную, если нужна копия заново.");
  process.exit(0);
}
if (!fs.existsSync(example)) {
  console.error("Нет файла .env.example");
  process.exit(1);
}
fs.copyFileSync(example, target);
console.log("Создан .env из .env.example.");
console.log("ВАЖНО: откройте webapp/.env и в VITE_FULLNODE_PROXY_TARGET подставьте реальный IP/домен ноды.");
console.log("Не оставляйте YOUR_VPS_IP — в DNS такого имени нет (ENOTFOUND).");
