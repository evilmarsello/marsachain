# Deploy

## TMA static

1. `cd webapp && npm run build`
2. Залить `dist/*` и `public/kotlin/` на document root.
3. nginx: `/fullnode/`, `/mining/`, `/api/pool/`, `/telegram/` — см. `hestia-nginx-marsa.conf`, `nginx.example.conf`.

## Pool API

```bash
export DEPLOY_HOST=your.server
export READ_NODE_URL=http://your-read-node/
export MINING_NODE_URL=http://your-mining-node/
# optional: NGINX_INCLUDE=/path/to/custom.conf
./deploy-pool-api-to-vps.sh
```

SSH-ключ на хосте. После деплоя — `POOL_TREASURY_KEYS` в `/opt/marsa-pool-api/.env`.

## Checklist

- HTTPS + домен в BotFather
- `BOT_TOKEN` в `server-optional`, `ALLOWED_ORIGINS` = origin Mini App
- Pool: Postgres + migrate/seed + treasury keys + fullnode с pool params
