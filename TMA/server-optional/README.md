# Сервер валидации Telegram `initData` (фаза 2)

Минимальный **Node.js 20+** HTTP-сервер без внешних npm-зависимостей.

## Что делает

- **`POST /telegram/validate`** — тело JSON `{ "initData": "<строка из Telegram.WebApp.initData>" }`.  
  Ответ при успехе: `{ "ok": true, "user": {...}, "query_id": "...", "auth_date": 123 }`.  
  Алгоритм: [Validating data received via the Mini App](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) (HMAC-SHA-256, `secret_key = HMAC_SHA256("WebAppData", bot_token)`).
- Проверка **`auth_date`** на свежесть (`INIT_DATA_MAX_AGE_SEC`, по умолчанию 24 ч).
- **`GET /health`** — `{ "ok": true }` для мониторинга.
- **CORS**: только origin из `ALLOWED_ORIGINS` (в dev по умолчанию Vite `5173`). В проде добавьте `https://ваш-домен-mini-app`.

## Запуск

```bash
cd server-optional
cp .env.example .env
# Отредактируйте .env: BOT_TOKEN, при необходимости ALLOWED_ORIGINS и PORT
npm start
```

Переменные можно не дублировать в shell: при старте читается файл **`server-optional/.env`** (если есть).

## Безопасность

- **`BOT_TOKEN` только здесь** — не в репозитории, не в `webapp`, не в Telegram-клиентском JS.
- Логи не содержат полного `initData` и токена.

## Опциональный прокси к fullnode

Отдельный прокси по-прежнему настраивается через **nginx** (см. `../deploy/nginx.example.conf`) или Vite в dev; этот сервер может оставаться только точкой валидации Telegram.
