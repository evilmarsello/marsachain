# Treasury & pool security

## Treasury Key Guard (TKG-v1)

Treasury private keys **do not exist** in this repository, fullnode, TMA, or Android. The only source is the `POOL_TREASURY_KEYS` environment variable on the pool API host (`.env` with mode `600`, outside git).

On startup, `marsa-pool-api` runs **Treasury Key Guard** — a five-step bootstrap (`src/treasuryGuard.mjs`):

| Stage | ID | What is checked |
|-------|-----|-----------------|
| 0 | `stage_0_env_present` | Keys come only from the process environment |
| 1 | `stage_1_count_match` | Exactly 5 keys (`pool_id` 0..4) |
| 2 | `stage_2_format_valid` | Base64, 32-byte Ed25519 seed |
| 3 | `stage_3_address_binding` | Public key address = `treasury_address` in config and in node `OfficialPoolParams` |
| 4 | `stage_4_runtime_seal` | Result is sealed until restart; env changes without restart do not apply |

Until TKG sets `withdraw_signing_enabled: true`, **outgoing payout signing is disabled** — requests accumulate in the DB (`pending`), but `processWithdrawBatch` does not use the keys.

Status without exposing secrets: `GET /health` → field `treasury_guard`.

## Withdraw flow (after TKG)

1. **Miner** — Ed25519 signature of `marsa:pool:withdraw:…` with their wallet (key never sent to pool API).
2. **API** — validates owed, `pool_id`, nonce (unique in DB), one pending withdraw per address.
3. **DB** — atomic debit of `pool_owed` + insert into `pool_withdrawals` (transaction).
4. **Worker** — only when `isWithdrawSigningEnabled()`: re-check key→address binding, treasury balance on node, batch limit (5), submit tx.
5. **Fullnode** — pool coinbase goes to treasury addresses; without node/config match, treasury will not receive funds.

## Component separation

```
[ Git: TMA ]          [ Git: Android ]          [ co-located: fullnode ]
 webapp (static)       SPV client                OfficialPoolParams
 marsa-pool-api        local keys                mining-api / REST
 server-optional       no treasury keys          no pool private keys
```

Treasury keys live **only** on the `marsa-pool-api` host, separate from the node and client code.

## Operations

- `chmod 600 /opt/marsa-pool-api/.env`
- API listens on `127.0.0.1:8788`, exposed only via nginx `/api/pool/`
- `BOT_TOKEN` — `server-optional` only, not in the webapp bundle
- After key rotation — `systemctl restart marsa-pool-api` (new TKG run)
