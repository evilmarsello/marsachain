# Marsa Telegram Mini App

```
TMA/
├── webapp/           Vite + TypeScript UI
├── shared/           Kotlin Multiplatform (crypto, tx) → JS bundle
├── marsa-pool-api/   Official pool backend (PPLNC, Postgres)
├── server-optional/  Telegram initData validation (Node, no deps)
└── deploy/           nginx snippets, deploy scripts
```

## Быстрый dev

```bash
cd webapp
npm install
cp .env.example .env   # upstream fullnode / mining / pool
npm run dev            # predev собирает shared → public/kotlin/
```

Vite проксирует `/fullnode`, `/mining`, `/api/pool`, `/telegram` на targets из `.env`.

Production: `npm run build` → `dist/` + `public/kotlin/` на статический хост; браузер ходит same-origin (см. `.env.production`, `deploy/`).

## Pool backend

Отдельный сервис, нужен для официальных пулов и withdraw. [`marsa-pool-api/README.md`](marsa-pool-api/README.md).

## Telegram validation

Опционально для prod: [`server-optional/README.md`](server-optional/README.md).

## Деплой

[`deploy/README.md`](deploy/README.md).
