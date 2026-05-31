# marsa-pool-api

Node 20+, PostgreSQL. Индексирует блоки с mining-ноды, ведёт shares/owed (PPLNC), подписывает withdraw с treasury-ключей.

## Запуск

```bash
cp .env.example .env
# DATABASE_URL, READ_NODE_URL, MINING_NODE_URL, POOL_TREASURY_KEYS
npm install
npm run migrate && npm run seed
npm start   # :8788
```

## Treasury keys

`POOL_TREASURY_KEYS` — пять base64 Ed25519 секретов через запятую, порядок `pool_id` 0..4. Только в `.env` на сервере.

При старте срабатывает **Treasury Key Guard (TKG-v1)** — 5 этапов проверки; без `withdraw_signing_enabled` выплаты не подписываются. Подробно: [`SECURITY.md`](SECURITY.md).

```bash
curl -sS http://127.0.0.1:8788/health | jq .treasury_guard
```

## Withdraw

- Net минимум **100 MRS**, комиссия сети **1 MRS** → gross owed ≥ **101 MRS**.

## nginx

```nginx
location /api/pool/ {
    proxy_pass http://127.0.0.1:8788/api/pool/;
    ...
}
```

TMA в prod: `VITE_POOL_API_BASE=/api/pool` (same-origin).

## Деплой

```bash
DEPLOY_HOST=your.host READ_NODE_URL=http://... MINING_NODE_URL=http://... \
  ./deploy/deploy-pool-api-to-vps.sh
```

На хосте после установки вручную дописать `POOL_TREASURY_KEYS` в `/opt/marsa-pool-api/.env`.
