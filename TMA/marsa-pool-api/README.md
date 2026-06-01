# marsa-pool-api

Node 20+, PostgreSQL. Indexes blocks from the mining node, tracks shares/owed (PPLNC), signs withdrawals with treasury keys.

## Run

```bash
cp .env.example .env
# DATABASE_URL, READ_NODE_URL, MINING_NODE_URL, POOL_TREASURY_KEYS
npm install
npm run migrate && npm run seed
npm start   # :8788
```

## Treasury keys

`POOL_TREASURY_KEYS` — five comma-separated base64 Ed25519 secrets, order `pool_id` 0..4. Server `.env` only.

On startup **Treasury Key Guard (TKG-v1)** runs a 5-stage check; without `withdraw_signing_enabled` payouts are not signed. Details: [`SECURITY.md`](SECURITY.md).

```bash
curl -sS http://127.0.0.1:8788/health | jq .treasury_guard
```

## Withdraw

- Minimum net **100 MRS**, network fee **1 MRS** → gross owed ≥ **101 MRS**.

## nginx

```nginx
location /api/pool/ {
    proxy_pass http://127.0.0.1:8788/api/pool/;
    ...
}
```

TMA in production: `VITE_POOL_API_BASE=/api/pool` (same-origin).

## Deploy

```bash
DEPLOY_HOST=your.host READ_NODE_URL=http://... MINING_NODE_URL=http://... \
  ./deploy/deploy-pool-api-to-vps.sh
```

After install, add `POOL_TREASURY_KEYS` manually to `/opt/marsa-pool-api/.env` on the host.
