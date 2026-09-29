#!/bin/bash
# Build91 admin — stop this EC2 instance when nobody has used the admin for a while.
# Run every 5 minutes by plotmap-idle.timer (installed by setup.sh as
# /usr/local/bin/plotmap-idle-shutdown).
#
# It asks server.py (GET http://127.0.0.1:8731/api/idle) two things:
#   idleSeconds — time since the last REAL request (the admin page's own background polling
#                 doesn't count, so a forgotten open tab doesn't keep the server awake);
#   busy        — an upload to S3, a download from S3 or a Publish is still running.
# It never stops the machine while busy. "shutdown -h" from inside the instance STOPS it (the
# default shutdown behaviour of an EBS-backed EC2 instance; README.md step 2 checks it), so
# the disk and all project files are kept and the wake-up link can start it again.
set -u

IDLE_MINUTES="${IDLE_MINUTES:-60}"        # stop after this long without real use
MIN_UPTIME_MINUTES="${MIN_UPTIME_MINUTES:-20}"   # never stop in the first minutes after a wake-up
STATE_DIR=/var/lib/plotmap-idle
mkdir -p "$STATE_DIR"

uptime_s=$(cut -d. -f1 /proc/uptime)
if [ "$uptime_s" -lt $((MIN_UPTIME_MINUTES * 60)) ]; then
  exit 0
fi

stop_now() {
  logger -t plotmap-idle "$1 — stopping the instance"
  /sbin/shutdown -h now "Build91 admin idle"
}

resp=$(curl -s --max-time 5 http://127.0.0.1:8731/api/idle || true)
read -r idle busy <<<"$(printf '%s' "$resp" | python3 -c 'import sys, json
try:
    d = json.load(sys.stdin); print(int(d["idleSeconds"]), 1 if d.get("busy") else 0)
except Exception:
    print("x x")' 2>/dev/null)"

if [ "${idle:-x}" = "x" ]; then
  # server.py isn't answering (systemd keeps restarting it). Don't leave a broken machine
  # running for ever: stop once it has been unreachable for IDLE_MINUTES.
  last_ok=$(stat -c %Y "$STATE_DIR/last-ok" 2>/dev/null || echo 0)
  if [ $(( $(date +%s) - last_ok )) -ge $((IDLE_MINUTES * 60)) ]; then
    stop_now "server.py has not answered for ${IDLE_MINUTES} min"
  fi
  exit 0
fi

touch "$STATE_DIR/last-ok"
if [ "$busy" = "1" ]; then
  logger -t plotmap-idle "busy (upload/download/publish running) — staying up"
  exit 0
fi
if [ "$idle" -ge $((IDLE_MINUTES * 60)) ]; then
  stop_now "no admin activity for $((idle / 60)) min"
fi
