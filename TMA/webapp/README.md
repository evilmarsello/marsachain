# webapp

## Dev

```bash
npm install
cp .env.example .env
npm run dev
```

`predev` / `prebuild` run `../gradlew :shared:syncKotlinJsToWebapp` — requires JDK and Gradle from the `TMA/` directory.

## Proxy (dev)

| Path | Env |
|------|-----|
| `/fullnode` | `VITE_FULLNODE_PROXY_TARGET` |
| `/mining` | `VITE_MINING_PROXY_TARGET` |
| `/api/pool` | `VITE_POOL_PROXY_TARGET` |
| `/telegram` | `VITE_TELEGRAM_VALIDATE_TARGET` |

In production (`npm run build`) nginx sets upstreams; the bundle only keeps `VITE_*_BASE` from `.env.production`.

## Node port note

Same as Android: if the API is exposed on **80/443** via nginx but fullnode listens on **8080** locally — use the public URL **without `:8080`** in `.env`. Verify with `curl` from your dev machine to the same host as `VITE_FULLNODE_PROXY_TARGET`.

## Production build

```bash
npm run build
```

Artifacts: `dist/` and `public/kotlin/shared.js`. Set `Cache-Control: no-store` on HTML/`index.html` (see deploy snippets).
