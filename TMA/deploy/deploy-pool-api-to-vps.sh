#!/bin/bash
# Sync marsa-pool-api to a remote host (rsync + remote install script).
set -euo pipefail

: "${DEPLOY_HOST:?Set DEPLOY_HOST (e.g. pool.example.com)}"
USER="${DEPLOY_USER:-root}"
SRC="$(cd "$(dirname "$0")/../marsa-pool-api" && pwd)"
REMOTE="${USER}@${DEPLOY_HOST}"

rsync -avz \
  --exclude node_modules \
  --exclude .env \
  --exclude '.git' \
  "${SRC}/" "${REMOTE}:/opt/marsa-pool-api/"

scp "$(dirname "$0")/install-marsa-pool-api-remote.sh" \
  "${REMOTE}:/root/install-marsa-pool-api-remote.sh"

ssh "${REMOTE}" 'bash /root/install-marsa-pool-api-remote.sh'

echo "Done. Check: curl -sS http://${DEPLOY_HOST}:8788/health (or via nginx /api/pool/list)"
