#!/usr/bin/env bash
# OpenClaw startup script for Railway.
# Runs as node (uid 1000) after railway-entrypoint.sh drops privileges.
set -e

GATEWAY_PORT=${PORT:-18789}
echo "[railway] Starting openclaw on port $GATEWAY_PORT..."

# ── Auth hygiene: prevent the multi-agent refresh_token race ───────────────────
# Background: OpenAI Codex OAuth uses refresh-token rotation
# (pi-ai openai-codex.js:136) — every refresh returns a NEW refresh_token and
# invalidates the old one. openclaw's refreshOAuthTokenWithLock
# (auth-profiles-CNyDTsy4.js:15689) holds a per-FILE lock during refresh,
# which is safe for one agent. But each agent dir under
# ~/.openclaw/.openclaw/agents/*/agent/ has its own auth.json with its own
# lock. If two agent dirs both carry the same starting refresh_token (e.g.
# from a `syncSiblingAgents` onboard or an export-to-railway tar that
# included `agents/background-worker`), both processes race to refresh —
# OpenAI invalidates the loser, that auth.json becomes permanently dead,
# and the bot fails the next time it tries to use it. The 4-5 day failure
# cadence in this deployment matched exactly that pattern.
#
# Fix: at every boot, keep ONLY `agents/main`. Any other agent dir is
# either historical drift or a sync artifact and must go before openclaw
# loads, otherwise we re-introduce the race. We back the directory up to
# /tmp so nothing is destroyed irreversibly inside a single container
# lifetime; the volume keeps the move durable.
AGENTS_ROOT="$HOME/.openclaw/.openclaw/agents"
if [ -d "$AGENTS_ROOT" ]; then
    STRAY_COUNT=0
    for d in "$AGENTS_ROOT"/*; do
        [ -d "$d" ] || continue
        name=$(basename "$d")
        if [ "$name" != "main" ]; then
            STRAY_COUNT=$((STRAY_COUNT + 1))
            STAMP=$(date +%F-%H%M%S)
            BACKUP="/tmp/stray-agent-${name}-${STAMP}"
            echo "[railway] Pruning stray agent dir to prevent refresh_token race: $d → $BACKUP"
            mv "$d" "$BACKUP" 2>/dev/null || rm -rf "$d"
        fi
    done
    if [ "$STRAY_COUNT" -gt 0 ]; then
        echo "[railway] Removed $STRAY_COUNT stray agent dir(s). Only 'main' remains."
    fi
fi

# ── Auth visibility: log auth.json state so we can diagnose from logs ──────────
# Without this we have to railway-ssh in to see if auth.json is present and
# being refreshed. With it, `railway logs` shows the state at every boot.
AUTH_FILE="$HOME/.openclaw/.openclaw/agents/main/agent/auth.json"
if [ -f "$AUTH_FILE" ]; then
    SIZE=$(stat -c %s "$AUTH_FILE" 2>/dev/null || echo "?")
    MTIME=$(stat -c %y "$AUTH_FILE" 2>/dev/null || echo "?")
    # Hash a chunk of the refresh_token so we can correlate boots without exposing the secret
    HASH=$(grep -oE '"refresh"\s*:\s*"[^"]+"' "$AUTH_FILE" 2>/dev/null | sha256sum 2>/dev/null | cut -c1-12 || echo "?")
    echo "[railway] auth.json present: size=$SIZE mtime=$MTIME refresh_hash=$HASH"
else
    echo "[railway] WARNING: auth.json missing — run scripts/reauth-codex-railway.sh once to onboard."
fi

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
