#!/usr/bin/env bash
# Deploy tody-game-hub to a Linux VPS behind NGINX Unit.
#
# Usage: bash deploy/unit/deploy.sh <server-user> <server-host> [site-dir]
#   server-user : SSH user (e.g. deploy)
#   server-host : VPS host or IP (e.g. 203.0.113.5)
#   site-dir    : deploy path on the server (default /srv/tody-game-hub)
#
# Run from the repo root (E:\tody-game-hub-main) on the machine that built the site.
set -euo pipefail

USER=${1:?usage: deploy.sh <server-user> <server-host> [site-dir]}
HOST=${2:?usage: deploy.sh <server-user> <server-host> [site-dir]}
DIR=${3:-/srv/tody-game-hub}

echo "==> Building node-server preset..."
NITRO_PRESET=node-server npm run build

echo "==> Syncing build output and server entry to ${USER}@${HOST}:${DIR}"
ssh "${USER}@${HOST}" "sudo mkdir -p ${DIR} && sudo chown \$(id -u):\$(id -g) ${DIR}"
rsync -avz --delete \
  .output/public \
  .output/server \
  .output/nitro.json \
  "${USER}@${HOST}:${DIR}/.output/"

echo "==> Syncing cloudflare shim (runtime loader for node-server build)"
rsync -avz deploy/cloudflare-workers-loader.mjs \
  deploy/cloudflare-workers-shim.mjs \
  deploy/register-cloudflare-loader.mjs \
  "${USER}@${HOST}:${DIR}/deploy/"

echo "==> Installing unit service file"
scp deploy/unit/unit-tody-game-hub.service "${USER}@${HOST}:/tmp/unit-tody-game-hub.service"
ssh "${USER}@${HOST}" "sudo mv /tmp/unit-tody-game-hub.service /etc/systemd/system/unit-tody-game-hub.service"

echo
echo "On the server, still to do (automatic script on your side):"
echo "  1. sudo systemctl daemon-reload && sudo systemctl enable --now unit-tody-game-hub"
echo "  2. Load the Unit config (run as root):"
echo "       curl -X PUT --data-binary @/srv/tody-game-hub/deploy/unit/unit-config.json \\"
echo "            --unix-socket /run/control.unit.sock http://localhost/config"
echo "  3. Add TLS certificate via:  unitc 'certificates' ...  (see README.md)"
echo "Done."