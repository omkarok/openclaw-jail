#!/usr/bin/env bash
# OpenClaw startup script for Railway.
# Runs as node (uid 1000) after railway-entrypoint.sh drops privileges.
set -e

GATEWAY_PORT=${PORT:-18789}
echo "[railway] Starting openclaw on port $GATEWAY_PORT..."

# ── Gateway token ──────────────────────────────────────────────────────────────
# Injected from Railway secret OPENCLAW_GATEWAY_TOKEN.
# On first boot (empty volume) openclaw.json doesn't exist yet — config set
# creates it. On subsequent boots it overwrites just this key.
if [ -n "$OPENCLAW_GATEWAY_TOKEN" ]; then
  openclaw config set gateway.auth.token "$OPENCLAW_GATEWAY_TOKEN"
  openclaw config set gateway.auth.mode token
else
  echo "[railway] WARNING: OPENCLAW_GATEWAY_TOKEN not set — using existing token in config."
fi

# ── Port + bind ────────────────────────────────────────────────────────────────
# Railway routes external HTTPS → container PORT. Bind to lan (0.0.0.0).
openclaw config set gateway.mode local
openclaw config set gateway.port "$GATEWAY_PORT"
openclaw config set gateway.bind lan

# ── Rate limiting ──────────────────────────────────────────────────────────────
openclaw config set gateway.auth.rateLimit \
  '{"maxAttempts":10,"windowMs":60000,"lockoutMs":300000}'

# ── Control UI origins ─────────────────────────────────────────────────────────
# Always include localhost. Add Railway public domain if known.
ORIGINS='["http://localhost:'$GATEWAY_PORT'","http://127.0.0.1:'$GATEWAY_PORT'"'
if [ -n "$RAILWAY_PUBLIC_DOMAIN" ]; then
  ORIGINS="$ORIGINS,\"https://$RAILWAY_PUBLIC_DOMAIN\""
fi
ORIGINS="$ORIGINS]"
openclaw config set gateway.controlUi.allowedOrigins "$ORIGINS"

# ── Tools profile ──────────────────────────────────────────────────────────────
# Ensure coding profile (file + exec access) is active.
openclaw config set tools.profile '"coding"'

# ── denyCommands ───────────────────────────────────────────────────────────────
openclaw config set gateway.nodes.denyCommands \
  '["canvas.eval","canvas.navigate","canvas.snapshot","camera.list","location.get","photos.latest","motion.activity","motion.pedometer","system.notify"]'

echo "[railway] Config applied."

# ── Node host (deferred until gateway is ready) ────────────────────────────────
# Must start AFTER the gateway — poll until the port accepts TCP connections,
# then launch. Backgrounded so the gateway can become the foreground process.
(
  echo "[railway] Waiting for gateway on port $GATEWAY_PORT..."
  for i in $(seq 1 30); do
    if bash -c "echo >/dev/tcp/127.0.0.1/$GATEWAY_PORT" 2>/dev/null; then
      echo "[railway] Gateway ready — starting node host (will retry on pairing failure)."
      while true; do
        openclaw node run --display-name railway-node --port "$GATEWAY_PORT" \
          2>&1 | tee -a /var/log/openclaw/node.log
        EXIT=$?
        echo "[railway] Node host exited (code $EXIT), retrying in 10s..."
        sleep 10
      done
    fi
    sleep 1
  done
  echo "[railway] WARNING: Gateway not ready after 30s — node host skipped."
) &
NODE_PID=$!
echo "[railway] Node host watcher started (PID $NODE_PID)"

# ── Gateway (foreground) ───────────────────────────────────────────────────────
# Railway keeps the service alive as long as this process runs.
trap "kill $NODE_PID 2>/dev/null" EXIT
exec openclaw gateway --port "$GATEWAY_PORT" --verbose 2>&1 | tee -a /var/log/openclaw/gateway.log
