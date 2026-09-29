#!/bin/bash
# Build91 admin — one-time setup of a fresh Ubuntu 24.04 EC2 instance (README.md, step 5).
#
#   sudo bash /opt/plotmap/plot-map/deploy/ec2/setup.sh
#
# Expects the repository already at /opt/plotmap (README step 4). It asks for:
#   - the admin's web address (e.g. admin.build91.in), whose DNS already points here;
#   - a username + password for the admin login;
#   - the Publish password (only if publish.config.json isn't there yet).
# Safe to run again: it rewrites the config files and restarts the services.
set -euo pipefail

APP_ROOT=/opt/plotmap
APP_DIR=$APP_ROOT/plot-map
HERE=$APP_DIR/deploy/ec2

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo: sudo bash $0"; exit 1; fi
if [ ! -f "$APP_DIR/server.py" ]; then echo "Can't find $APP_DIR/server.py — clone the repository to $APP_ROOT first (README step 4)."; exit 1; fi

read -rp "Admin web address (e.g. admin.build91.in): " DOMAIN
read -rp "Admin login username: " ADMIN_USER
while true; do
  read -rsp "Admin login password: " ADMIN_PASS; echo
  read -rsp "Same password again: " ADMIN_PASS2; echo
  [ "$ADMIN_PASS" = "$ADMIN_PASS2" ] && [ -n "$ADMIN_PASS" ] && break
  echo "Passwords were empty or didn't match — try again."
done

echo "== Installing packages (Python, boto3, Pillow, Caddy)…"
apt-get update -y
apt-get install -y python3 python3-boto3 python3-pil curl git debian-keyring debian-archive-keyring apt-transport-https gnupg
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "== App user and folders…"
id plotmap >/dev/null 2>&1 || useradd --system --home "$APP_ROOT" --shell /usr/sbin/nologin plotmap
mkdir -p "$APP_DIR/projects"
chown -R plotmap:plotmap "$APP_ROOT"

# Publish / cloud-sync settings. awsProfile is EMPTY on purpose: boto3 then uses the EC2
# instance's IAM role (README step 3), so no AWS keys are stored on this machine.
CFG=$APP_DIR/publish.config.json
if [ ! -f "$CFG" ]; then
  read -rsp "Publish password (the one the admin types in ☁ Publish): " PUB_PASS; echo
  PUB_PASS="$PUB_PASS" python3 - "$APP_DIR/publish.config.example.json" "$CFG" <<'PY'
import json, os, sys
cfg = json.load(open(sys.argv[1], encoding="utf-8"))
cfg["awsProfile"] = ""
cfg["password"] = os.environ["PUB_PASS"]
json.dump(cfg, open(sys.argv[2], "w", encoding="utf-8"), indent=2)
PY
  echo "   wrote $CFG (check bucket / distributionId in it match yours)"
fi
chown plotmap:plotmap "$CFG"; chmod 600 "$CFG"

echo "== Caddy (HTTPS + login)…"
HASH=$(caddy hash-password --plaintext "$ADMIN_PASS")
mkdir -p /var/log/caddy; chown caddy:caddy /var/log/caddy
sed -e "s|__DOMAIN__|$DOMAIN|" -e "s|__ADMIN_USER__|$ADMIN_USER|" -e "s|__ADMIN_HASH__|$HASH|" \
  "$HERE/Caddyfile.template" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

echo "== Services (server + idle shutdown)…"
install -m 644 "$HERE/plotmap.service" /etc/systemd/system/plotmap.service
install -m 644 "$HERE/plotmap-idle.service" /etc/systemd/system/plotmap-idle.service
install -m 644 "$HERE/plotmap-idle.timer" /etc/systemd/system/plotmap-idle.timer
install -m 755 "$HERE/idle-shutdown.sh" /usr/local/bin/plotmap-idle-shutdown
systemctl daemon-reload
systemctl enable --now plotmap.service
systemctl enable --now plotmap-idle.timer
systemctl enable caddy
systemctl restart caddy

sleep 3
echo
if curl -s --max-time 5 http://127.0.0.1:8731/api/health | grep -q '"ok": true'; then
  echo "✔ server.py is running."
else
  echo "✖ server.py did not answer — see: sudo journalctl -u plotmap -n 50"
fi
echo "Next: open https://$DOMAIN/?admin=1 (Caddy may take a minute to get the HTTPS certificate)."
