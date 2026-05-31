# Treasury & pool security

## Treasury Key Guard (TKG-v1)

Приватные ключи treasury **не существуют в репозитории, fullnode, TMA и Android**. Единственный источник — переменная окружения `POOL_TREASURY_KEYS` на хосте pool API (файл `.env` с правами `600`, вне git).

При старте `marsa-pool-api` выполняется **Treasury Key Guard** — пятиступенчатый bootstrap (`src/treasuryGuard.mjs`):

| Этап | ID | Что проверяется |
|------|-----|----------------|
| 0 | `stage_0_env_present` | Ключи только из env процесса |
| 1 | `stage_1_count_match` | Ровно 5 ключей (pool_id 0..4) |
| 2 | `stage_2_format_valid` | Base64, Ed25519 seed 32 байта |
| 3 | `stage_3_address_binding` | Публичный адрес ключа = `treasury_address` в config и в `OfficialPoolParams` ноды |
| 4 | `stage_4_runtime_seal` | Результат запечатывается до перезапуска; смена env без restart не применяется |

Пока TKG не выдал `withdraw_signing_enabled: true`, **подпись исходящих выплат отключена** — заявки копятся в БД (`pending`), но `processWithdrawBatch` не трогает ключи.

Статус без секретов: `GET /health` → поле `treasury_guard`.

## Цепочка withdraw (после TKG)

1. **Майнер** — Ed25519 подпись сообщения `marsa:pool:withdraw:…` своим кошельком (ключ не уходит на сервер pool API).
2. **API** — проверка owed, pool_id, nonce (уникальность в БД), один pending withdraw на адрес.
3. **БД** — атомарное списание `pool_owed` + insert в `pool_withdrawals` (транзакция).
4. **Worker** — только при `isWithdrawSigningEnabled()`: повторная привязка key→address, баланс treasury на ноде, лимит batch (5), submit tx.
5. **Fullnode** — coinbase пулов изначально на treasury-адреса; без совпадения с нодой средства на treasury не появятся.

## Разделение компонентов

```
[ Git: TMA ]          [ Git: Android ]          [ рядом: fullnode ]
 webapp (статика)      SPV-клиент               OfficialPoolParams
 marsa-pool-api        локальные ключи          mining-api / REST
 server-optional       без treasury keys        без приватных ключей пулов
```

Treasury keys живут **только** на хосте `marsa-pool-api`, отдельно от ноды и от клиентского кода.

## Операционная гигиена

- `chmod 600 /opt/marsa-pool-api/.env`
- API слушает `127.0.0.1:8788`, наружу — только nginx `/api/pool/`
- `BOT_TOKEN` — только `server-optional`, не в webapp bundle
- После смены ключей — `systemctl restart marsa-pool-api` (новый прогон TKG)
