# Deploy

## TMA static

1. `cd webapp && npm run build`
2. Upload `dist/*` and `public/kotlin/` to the document root.
3. nginx: `/fullnode/`, `/mining/`, `/api/pool/`, `/telegram/` — see `hestia-nginx-marsa.conf`, `nginx.example.conf`.

## Pool API

```bash
export DEPLOY_HOST=your.server
export READ_NODE_URL=http://your-read-node/
export MINING_NODE_URL=http://your-mining-node/
# optional: NGINX_INCLUDE=/path/to/custom.conf
./deploy-pool-api-to-vps.sh
```

SSH key on the host. After deploy — set `POOL_TREASURY_KEYS` in `/opt/marsa-pool-api/.env`.

## Checklist

- HTTPS + domain in BotFather
- `BOT_TOKEN` in `server-optional`, `ALLOWED_ORIGINS` = Mini App origin
- Pool: Postgres + migrate/seed + treasury keys + fullnode with pool params
