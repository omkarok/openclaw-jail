#!/usr/bin/env bash
# Exports openclaw state from laptop Docker volumes → Railway volume.
# Run this AFTER Railway deploys and the service is running.
#
# Usage:
#   bash scripts/export-to-railway.sh <railway-service-name>
#
# Requires: railway CLI logged in, docker running locally.
#
# NOTE: For Codex OAuth recovery specifically, prefer
# scripts/reauth-codex-railway.sh — it onboards directly inside the Railway
# container (openclaw auto-detects remote env) so no local Docker → Railway
# tar copy is needed. This script remains useful for bulk-migrating sessions
# / workspace / agents config from a laptop to Railway on initial deploy.

set -e
SERVICE=${1:-openclaw}

echo "[export] Bundling openclaw state..."

TMPDIR_LOCAL=$(mktemp -d)
EXPORT_TAR="$TMPDIR_LOCAL/openclaw-export.tar.gz"

# 1. Export openclaw config + agent auth from bind mount
tar -czf "$EXPORT_TAR" \
  -C ~/openclaw-jail/openclaw-home \
  .openclaw/.openclaw/openclaw.json \
  .openclaw/.openclaw/agents/main/agent \
  .openclaw/.openclaw/agents/background-worker \
  2>/dev/null || true

# 2. Append sessions from named Docker volume
docker run --rm \
  -v openclaw-jail_openclaw-sessions:/src \
  -v "$TMPDIR_LOCAL":/out \
  alpine \
  tar czf /out/sessions.tar.gz -C /src . 2>/dev/null || echo "[export] WARNING: sessions volume not found, skipping"

# 3. Append workspace (task queue, memory, agents config, results)
tar -czf "$TMPDIR_LOCAL/workspace.tar.gz" \
  -C ~/openclaw-jail \
  workspace/task-queue \
  workspace/memory \
  workspace/agents \
  workspace/HEARTBEAT.md \
  workspace/SESSION_HANDOFF.md \
  2>/dev/null || true

echo "[export] Uploading to Railway service: $SERVICE"
echo "[export] This will shell into Railway and extract the data."
echo ""
echo "Run these commands in the Railway shell that opens:"
echo ""
echo "  # Extract config + auth:"
echo "  cat /tmp/openclaw-export.tar.gz | tar xzf - -C /home/node/"
echo ""
echo "  # Extract sessions (if present):"
echo "  cat /tmp/sessions.tar.gz | tar xzf - -C /home/node/.openclaw/.openclaw/agents/main/sessions/ 2>/dev/null"
echo ""
echo "  # Extract workspace:"
echo "  cat /tmp/workspace.tar.gz | tar xzf - -C /home/node/"
echo ""
echo "  # Then restart the service to pick up auth:"
echo "  exit"
echo ""

# Upload files via railway CLI
railway shell --service "$SERVICE" -- bash -c "
  cat > /tmp/openclaw-export.tar.gz" < "$EXPORT_TAR"

if [ -f "$TMPDIR_LOCAL/sessions.tar.gz" ]; then
  railway shell --service "$SERVICE" -- bash -c "
    cat > /tmp/sessions.tar.gz" < "$TMPDIR_LOCAL/sessions.tar.gz"
fi

if [ -f "$TMPDIR_LOCAL/workspace.tar.gz" ]; then
  railway shell --service "$SERVICE" -- bash -c "
    cat > /tmp/workspace.tar.gz" < "$TMPDIR_LOCAL/workspace.tar.gz"
fi

echo "[export] Files uploaded to /tmp/ on Railway. Shell in to extract:"
echo "  railway shell --service $SERVICE"

rm -rf "$TMPDIR_LOCAL"
