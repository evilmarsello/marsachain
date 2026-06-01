# Marsa Telegram Mini App

```
TMA/
├── webapp/           Vite + TypeScript UI
├── shared/           Kotlin Multiplatform (crypto, tx) → JS bundle
├── marsa-pool-api/   Official pool backend (PPLNC, Postgres)
├── server-optional/  Telegram initData validation (Node, no deps)
└── deploy/           nginx snippets, deploy scripts
```

## Quick dev

```bash
cd webapp
npm install
cp .env.example .env   # upstream fullnode / mining / pool
npm run dev            # predev builds shared → public/kotlin/
```

Vite proxies `/fullnode`, `/mining`, `/api/pool`, `/telegram` to targets from `.env`.

Production: `npm run build` → `dist/` + `public/kotlin/` on a static host; the browser uses same-origin paths (see `.env.production`, `deploy/`).

## Pool backend

Separate service, required for official pools and withdrawals. [`marsa-pool-api/README.md`](marsa-pool-api/README.md).

## Telegram validation

Optional in production: [`server-optional/README.md`](server-optional/README.md).

## Deploy

[`deploy/README.md`](deploy/README.md).
