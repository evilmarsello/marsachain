# Telegram `initData` validation server (phase 2)

Minimal **Node.js 20+** HTTP server with no external npm dependencies.

## What it does

- **`POST /telegram/validate`** — JSON body `{ "initData": "<string from Telegram.WebApp.initData>" }`.  
  Success response: `{ "ok": true, "user": {...}, "query_id": "...", "auth_date": 123 }`.  
  Algorithm: [Validating data received via the Mini App](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) (HMAC-SHA-256, `secret_key = HMAC_SHA256("WebAppData", bot_token)`).
- **`auth_date`** freshness check (`INIT_DATA_MAX_AGE_SEC`, default 24 h).
- **`GET /health`** — `{ "ok": true }` for monitoring.
- **CORS**: only origins listed in `ALLOWED_ORIGINS` (dev default includes Vite `5173`). In production add `https://your-mini-app-domain`.

## Run

```bash
cd server-optional
cp .env.example .env
# Edit .env: BOT_TOKEN, ALLOWED_ORIGINS and PORT if needed
npm start
```

Variables can live in **`server-optional/.env`** only (loaded at startup).

## Security

- **`BOT_TOKEN` only here** — not in the repo, not in `webapp`, not in client-side Telegram JS.
- Logs do not include full `initData` or the bot token.

## Optional fullnode proxy

Fullnode proxying is still done via **nginx** (see `../deploy/nginx.example.conf`) or Vite in dev; this service can stay validation-only.
