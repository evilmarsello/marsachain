# webapp

## Dev

```bash
npm install
cp .env.example .env
npm run dev
```

`predev` / `prebuild` вызывают `../gradlew :shared:syncKotlinJsToWebapp` — нужен JDK и Gradle из каталога `TMA/`.

## Прокси (dev)

| Path | Env |
|------|-----|
| `/fullnode` | `VITE_FULLNODE_PROXY_TARGET` |
| `/mining` | `VITE_MINING_PROXY_TARGET` |
| `/api/pool` | `VITE_POOL_PROXY_TARGET` |
| `/telegram` | `VITE_TELEGRAM_VALIDATE_TARGET` |

В prod (`npm run build`) upstream задаёт nginx; в bundle остаются только `VITE_*_BASE` из `.env.production`.

## Нюанс с портом ноды

Как в Android: если API снаружи на **80/443** через nginx, а fullnode слушает **8080** только локально — в `.env` указывайте внешний URL **без `:8080`**. Проверка: `curl` с dev-машины на тот же host, что в `VITE_FULLNODE_PROXY_TARGET`.

## Production build

```bash
npm run build
```

Артефакты: `dist/` и `public/kotlin/shared.js`. HTML/`index.html` — `Cache-Control: no-store` (см. deploy snippets).
