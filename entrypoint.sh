#!/usr/bin/env bash
set -euo pipefail

# Use Railway's PORT env var, fall back to 18789 for local development
GATEWAY_PORT="${PORT:-18789}"

# Skip metadata endpoint check on Railway (RAILWAY=true is set by the platform).
# On local Docker, the egress-rules.sh iptables script blocks this endpoint.
if [ "${RAILWAY:-}" = "true" ]; then
  echo "[preflight] Running on Railway — skipping metadata endpoint check."
else
  echo "[preflight] Verifying egress policy (metadata endpoint check)..."
  if curl --max-time 3 --silent http://169.254.169.254/ > /dev/null 2>&1; then
    echo "[preflight] FATAL: Cloud metadata endpoint 169.254.169.254 is reachable."
    echo "[preflight] FATAL: Egress rules are NOT active. Refusing to start gateway."
    echo "[preflight] FATAL: Run: sudo bash ~/openclaw-jail/egress-rules.sh in WSL2, then restart."
    exit 1
  else
    echo "[preflight] OK: Metadata endpoint blocked — egress policy confirmed active."
  fi
fi

echo "[startup] Starting openclaw gateway on port ${GATEWAY_PORT}..."
exec openclaw gateway --port "${GATEWAY_PORT}" --verbose 2>&1 | tee /var/log/openclaw/gateway.log
