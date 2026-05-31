#!/bin/bash
# Runs on the target host as root. Installs Node 20+, Postgres, systemd unit.
set -euo pipefail

APP_DIR="/opt/marsa-pool-api"
DB_NAME="marsa_pool"
DB_USER="marsa"
READ_NODE_URL="${READ_NODE_URL:-http://127.0.0.1:8080}"
MINING_NODE_URL="${MINING_NODE_URL:-http://127.0.0.1:8080}"
NGINX_INCLUDE="${NGINX_INCLUDE:-}"

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 20 ]]; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

if ! command -v psql >/dev/null 2>&1; then
  apt-get install -y -qq postgresql postgresql-contrib
  systemctl enable --now postgresql
fi

mkdir -p "$APP_DIR"
chown root:root "$APP_DIR"

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  DB_PASS="$(openssl rand -hex 16)"
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
  echo "$DB_PASS" > /root/.marsa_pool_db_pass
  chmod 600 /root/.marsa_pool_db_pass
fi

DB_PASS="$(cat /root/.marsa_pool_db_pass)"

if [[ ! -f "${APP_DIR}/.env" ]]; then
  cat > "${APP_DIR}/.env" <<EOF
PORT=8788
DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}
READ_NODE_URL=${READ_NODE_URL}
MINING_NODE_URL=${MINING_NODE_URL}
POOL_TREASURY_KEYS=
POOL_REWARD_MODE=pplnc
PPLNC_TARGET_WINDOW_SECONDS=3600
PPLNC_N_MIN=10000
PPLNC_RECALC_INTERVAL_SECONDS=300
PPLNC_RATE_EMA_ALPHA=0.2
POOL_FINALITY_BLOCKS=8
EOF
  chmod 600 "${APP_DIR}/.env"
fi

ensure_env() {
  local key="$1"
  local val="$2"
  if grep -q "^${key}=" "${APP_DIR}/.env"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "${APP_DIR}/.env"
  else
    echo "${key}=${val}" >> "${APP_DIR}/.env"
  fi
}
ensure_env POOL_REWARD_MODE pplnc
ensure_env PPLNC_TARGET_WINDOW_SECONDS 3600
ensure_env PPLNC_N_MIN 10000
ensure_env PPLNC_RECALC_INTERVAL_SECONDS 300
ensure_env PPLNC_RATE_EMA_ALPHA 0.2
ensure_env POOL_FINALITY_BLOCKS 8

cd "$APP_DIR"
npm install --omit=dev
npm run migrate
npm run seed

cat > /etc/systemd/system/marsa-pool-api.service <<'UNIT'
[Unit]
Description=Marsa official mining pool API
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/marsa-pool-api
EnvironmentFile=/opt/marsa-pool-api/.env
ExecStart=/usr/bin/node /opt/marsa-pool-api/src/server.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable marsa-pool-api
systemctl restart marsa-pool-api

if [[ -n "$NGINX_INCLUDE" && -f "$NGINX_INCLUDE" ]] && ! grep -q 'location /api/pool/' "$NGINX_INCLUDE"; then
  cp -a "$NGINX_INCLUDE" "/root/nginx.pool-api.bak.$(date +%Y%m%d%H%M%S)"
  cat >> "$NGINX_INCLUDE" <<'NGX'

location /api/pool/ {
    proxy_pass http://127.0.0.1:8788/api/pool/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
}
NGX
  nginx -t && systemctl reload nginx
fi

echo "marsa-pool-api deployed; health:"
curl -sS http://127.0.0.1:8788/health || true
