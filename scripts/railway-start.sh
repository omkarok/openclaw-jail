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

# ── Auth seed (recovery channel) ───────────────────────────────────────────────
# When OAuth refresh fails server-side (refresh_token_reused, revoked, etc.)
# the bot can't self-heal because re-onboarding is an interactive flow we
# can't run from a Railway shell-less environment. This block lets us inject
# a fresh auth-profiles.json via a base64-encoded Railway env var
# (OPENCLAW_AUTH_SEED_B64). The seed is only applied if its `expires` is
# newer than what's already on the volume — so once openclaw refreshes the
# token naturally, the on-disk copy wins and the env var becomes a no-op.
# Leave the env var set as a safety net or remove it once you're stable.
AGENT_DIR="$HOME/.openclaw/.openclaw/agents/main/agent"
AUTH_STORE="$AGENT_DIR/auth-profiles.json"
LEGACY_AUTH="$AGENT_DIR/auth.json"
mkdir -p "$AGENT_DIR"

if [ -n "${OPENCLAW_AUTH_SEED_B64:-}" ]; then
    SEED_TMP=$(mktemp)
    if echo "$OPENCLAW_AUTH_SEED_B64" | base64 -d > "$SEED_TMP" 2>/dev/null && python3 -c "import json,sys; json.load(open('$SEED_TMP'))" 2>/dev/null; then
        SEED_EXPIRES=$(python3 -c "import json; d=json.load(open('$SEED_TMP')); print(max((p.get('expires',0) for p in d.get('profiles',{}).values()), default=0))")
        DISK_EXPIRES=0
        if [ -f "$AUTH_STORE" ]; then
            DISK_EXPIRES=$(python3 -c "import json; d=json.load(open('$AUTH_STORE')); print(max((p.get('expires',0) for p in d.get('profiles',{}).values()), default=0))" 2>/dev/null || echo 0)
        fi
        if [ "$SEED_EXPIRES" -gt "$DISK_EXPIRES" ]; then
            cp "$SEED_TMP" "$AUTH_STORE"
            cp "$SEED_TMP" "$LEGACY_AUTH"
            chmod 600 "$AUTH_STORE" "$LEGACY_AUTH"
            echo "[railway] Auth seed applied (seed_expires=$SEED_EXPIRES disk_expires=$DISK_EXPIRES)"
        else
            echo "[railway] Auth seed older than on-disk (seed_expires=$SEED_EXPIRES disk_expires=$DISK_EXPIRES) — skipping."
        fi
    else
        echo "[railway] WARNING: OPENCLAW_AUTH_SEED_B64 set but is not valid base64 JSON — ignored."
    fi
    rm -f "$SEED_TMP"
fi

# ── Auth visibility: log auth.json state so we can diagnose from logs ──────────
# Without this we have to railway-ssh in to see if auth.json is present and
# being refreshed. With it, `railway logs` shows the state at every boot.
if [ -f "$AUTH_STORE" ]; then
    SIZE=$(stat -c %s "$AUTH_STORE" 2>/dev/null || echo "?")
    MTIME=$(stat -c %y "$AUTH_STORE" 2>/dev/null || echo "?")
    HASH=$(grep -oE '"refresh"\s*:\s*"[^"]+"' "$AUTH_STORE" 2>/dev/null | sha256sum 2>/dev/null | cut -c1-12 || echo "?")
    echo "[railway] auth-profiles.json present: size=$SIZE mtime=$MTIME refresh_hash=$HASH"
elif [ -f "$LEGACY_AUTH" ]; then
    SIZE=$(stat -c %s "$LEGACY_AUTH" 2>/dev/null || echo "?")
    MTIME=$(stat -c %y "$LEGACY_AUTH" 2>/dev/null || echo "?")
    HASH=$(grep -oE '"refresh"\s*:\s*"[^"]+"' "$LEGACY_AUTH" 2>/dev/null | sha256sum 2>/dev/null | cut -c1-12 || echo "?")
    echo "[railway] auth.json (legacy) present: size=$SIZE mtime=$MTIME refresh_hash=$HASH"
else
    echo "[railway] WARNING: no auth-profiles.json or auth.json found — set OPENCLAW_AUTH_SEED_B64 or onboard."
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

# ── Agent model ────────────────────────────────────────────────────────────────
# ChatGPT Plus / Codex subscription drops support for specific Codex model
# variants periodically (e.g. `gpt-5.3-codex` returned
# `{"detail":"The 'gpt-5.3-codex' model is not supported when using Codex with
# a ChatGPT account."}`, then `gpt-5.2-codex` followed). Override via the
# Railway env var OPENCLAW_CODEX_MODEL so swapping is a variable change, not
# a code push. Default tracks openclaw's own latest default
# (auth-DMRbDLpk.js: OPENAI_CODEX_DEFAULT_MODEL).
CODEX_MODEL="${OPENCLAW_CODEX_MODEL:-openai-codex/gpt-5.5}"
echo "[railway] Setting agents.defaults.model = $CODEX_MODEL"
openclaw config set agents.defaults.model "\"$CODEX_MODEL\""

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

# ── Tools also-allow: restore `message` tool for user-triggered replies ────────
# openclaw 2026.5.x's `coding` profile is intentionally restrictive: it strips
# the `message` tool from runs handling untrusted input (user-typed WhatsApp
# DMs, group messages, etc.) as a prompt-injection mitigation. Keep `coding`
# for the other tool restrictions, re-allow just `message`.
openclaw config set tools.alsoAllow '["message"]'

# ── Reply delivery: automatic (old openclaw behavior) ──────────────────────────
# openclaw 2026.5.x changed the default reply pipeline. In "message_tool" mode
# (now the default), the agent must EXPLICITLY call tool=message to deliver
# its reply — text output alone is treated as private "thinking" and never
# leaves the agent. Symptom: agent run completes with stopReason=stop and
# output_text.delta>0, but no outbound WhatsApp send. Cron paths bypass this
# because they set sourceReplyDeliveryMode=message_tool_only AND the
# auto-generated cron prompt instructs the agent to call the tool. User-DM
# paths don't.
#
# Switch back to "automatic" so the agent's final text-output is auto-sent as
# the reply (matches the bot's prior contract since openclaw 2026.3.x).
openclaw config set messages.visibleReplies '"automatic"'

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
