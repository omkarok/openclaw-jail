#!/usr/bin/env bash
# reauth-codex.sh - One-command recovery for "OAuth token refresh failed for openai-codex".
#
# Run from WSL2 / Linux / macOS:
#   bash ~/openclaw-jail/scripts/reauth-codex.sh
#
# What it does:
#   1. Backs up the current auth.json (rolling, dated)
#   2. Runs `openclaw onboard --auth-choice openai-codex ...` INTERACTIVELY (TTY required)
#      You will see a URL - open it in your browser, sign in with ChatGPT Plus, approve
#   3. Verifies auth.json mtime is fresh
#   4. Restarts the openclaw container so the gateway picks up new credentials
#
# Why this exists: openclaw hard-codes "OAuth requires interactive mode" -
# the user MUST approve in a browser. This script just removes the multi-step
# muscle-memory tax.

set -euo pipefail

JAIL_DIR="${OPENCLAW_JAIL_DIR:-$HOME/openclaw-jail}"
COMPOSE="$JAIL_DIR/docker-compose.yml"
AUTH_FILE="$JAIL_DIR/openclaw-home/.openclaw/.openclaw/agents/main/agent/auth.json"

if [[ ! -f "$COMPOSE" ]]; then
    echo "FATAL: $COMPOSE not found. Set OPENCLAW_JAIL_DIR or run on the right machine." >&2
    exit 1
fi

# 1. Container must be up so we can exec into it
echo "[1/4] Checking container state..."
if [[ "$(docker compose -f "$COMPOSE" ps --status running -q | wc -l)" -eq 0 ]]; then
    echo "      Container is not running. Starting it..."
    docker compose -f "$COMPOSE" up -d
    sleep 5
fi

# 2. Backup current auth.json (if any)
echo "[2/4] Backing up current auth.json..."
before_mtime=0
if [[ -f "$AUTH_FILE" ]]; then
    stamp="$(date +%F-%H%M%S)"
    cp "$AUTH_FILE" "$AUTH_FILE.bak-$stamp"
    echo "      Backup: $AUTH_FILE.bak-$stamp"
    before_mtime="$(stat -c %Y "$AUTH_FILE" 2>/dev/null || stat -f %m "$AUTH_FILE")"
else
    echo "      No existing auth.json - first-time onboard."
fi

# 3. Run onboard interactively (needs real TTY + your browser)
echo "[3/4] Starting OAuth onboard - sign in with ChatGPT Plus when prompted..."
echo "      A URL will print below. Open it, approve, come back."
echo

# No -T: we need TTY so openclaw can prompt
docker compose -f "$COMPOSE" exec openclaw \
    openclaw onboard --auth-choice openai-codex \
        --no-install-daemon --skip-channels --skip-skills --skip-ui \
        --workspace /home/node/workspace

# 4. Verify the auth file was rewritten, then restart so gateway re-reads it
echo
echo "[4/4] Verifying new auth.json and restarting container..."
if [[ ! -f "$AUTH_FILE" ]]; then
    echo "FATAL: auth.json missing after onboard. Onboard did not complete." >&2
    exit 1
fi
after_mtime="$(stat -c %Y "$AUTH_FILE" 2>/dev/null || stat -f %m "$AUTH_FILE")"
if [[ "$after_mtime" -le "$before_mtime" ]]; then
    echo "WARN: auth.json mtime did not advance. Onboard may have been cancelled." >&2
    echo "      Re-run this script if the bot still fails to reply." >&2
fi

docker compose -f "$COMPOSE" restart openclaw >/dev/null

echo
echo "DONE. Text your bot from your allow-listed number to confirm."
echo "      Tail logs:  docker compose -f $COMPOSE logs --follow openclaw"
