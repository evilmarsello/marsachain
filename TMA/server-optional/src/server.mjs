import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateTelegramInitData } from "./initData.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = Number.parseInt(process.env.PORT || "8787", 10);
const MAX_AGE = Number.parseInt(process.env.INIT_DATA_MAX_AGE_SEC || "86400", 10);
const ALLOWED = (process.env.ALLOWED_ORIGINS || "http://127.0.0.1:5173,http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** CORS: only listed origins (in production set ALLOWED_ORIGINS to your Mini App domain). */
function cors(req) {
  const origin = req.headers.origin;
  if (!origin) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };
  }
  if (!ALLOWED.includes(origin)) {
    return null;
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function readBody(req, limit = 64_000) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (c) => {
      total += c.length;
      if (total > limit) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    ...headers,
  });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  const c = cors(req);

  if (req.method === "OPTIONS") {
    if (!c) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.writeHead(204, c);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, { ok: true, service: "marsa-tma-server" }, c || {});
    return;
  }

  if (req.method === "POST" && req.url === "/telegram/validate") {
    if (!c) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "forbidden_origin" }));
      return;
    }
    if (!BOT_TOKEN) {
      json(res, 503, { ok: false, error: "server_misconfigured_no_bot_token" }, c);
      return;
    }
    try {
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        json(res, 400, { ok: false, error: "invalid_json" }, c);
        return;
      }
      const initData = body?.initData;
      if (typeof initData !== "string") {
        json(res, 400, { ok: false, error: "initData_required" }, c);
        return;
      }
      const result = validateTelegramInitData(initData, BOT_TOKEN, MAX_AGE);
      if (!result.ok) {
        json(res, 401, { ok: false, error: result.error }, c);
        return;
      }
      json(
        res,
        200,
        {
          ok: true,
          user: result.user,
          query_id: result.queryId,
          auth_date: result.authDate,
        },
        c,
      );
    } catch (e) {
      if (e?.message === "body_too_large") {
        json(res, 413, { ok: false, error: "payload_too_large" }, c);
        return;
      }
      json(res, 500, { ok: false, error: "internal_error" }, c);
    }
    return;
  }

  res.writeHead(404, c || {});
  res.end();
});

server.listen(PORT, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`marsa-tma-server listening on http://127.0.0.1:${PORT}`);
  if (!BOT_TOKEN) {
    // eslint-disable-next-line no-console
    console.warn("WARN: BOT_TOKEN is not set — POST /telegram/validate will return 503");
  }
});
