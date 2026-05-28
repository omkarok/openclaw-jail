#!/usr/bin/env bash
# hotfix-acpx-railway.sh — Live hotfix for the ACP runtime backend on
# Railway. Use this when `sessions_spawn(runtime:"acp", ...)` returns
# "ACP runtime backend is currently unavailable" and the gateway log
# shows `acpx runtime setup failed: failed to install plugin-local
# acpx` / `EACCES`.
#
# Why this exists: the @openclaw/acpx extension's ensureAcpx() does a
# lazy `npm install acpx@<pinned>` into /usr/local/lib/node_modules/
# openclaw/extensions/acpx/node_modules on first ACP spawn. That path
# is root-owned, so the install fails the moment openclaw has dropped
# to uid 1000. `railway ssh` lands us as root (Dockerfile.railway has
# no USER directive — setpriv only drops privileges for the gateway
# process), so from here we *can* write the install in. The next
# ensureAcpx() call inside openclaw rechecks the bundled binary and
# skips the install entirely.
#
# This is a stopgap. The durable fix lives in Dockerfile.railway via
# the ACPX_VERSION build arg — once Railway rebuilds and deploys that
# image, this script is no longer needed. Re-run it after any Railway
# redeploy that uses a pre-fix image.
#
# Usage: bash scripts/hotfix-acpx-railway.sh [service-name] [acpx-version]
#   service-name defaults to "openclaw"
#   acpx-version defaults to 0.1.15 (matches ACPX_PINNED_VERSION in
#   openclaw 2026.3.2 — bump if the openclaw version on Railway is newer)
set -euo pipefail

SERVICE="${1:-openclaw}"
ACPX_VERSION="${2:-0.1.15}"

if ! command -v railway >/dev/null 2>&1; then
    echo "FATAL: railway CLI not installed. See scripts/reauth-codex-railway.sh for install steps." >&2
    exit 1
fi
if ! railway whoami >/dev/null 2>&1; then
    echo "FATAL: Not logged into Railway. Run: railway login" >&2
    exit 1
fi

echo "==> Hotfixing acpx on Railway service '$SERVICE' (target acpx@$ACPX_VERSION)..."

# Single ssh round-trip — heredoc passes ACPX_VERSION as $1 to the remote bash.
railway ssh --service "$SERVICE" -- bash -s -- "$ACPX_VERSION" <<'REMOTE'
set -euo pipefail
ACPX_VERSION="$1"

EXT_DIR=/usr/local/lib/node_modules/openclaw/extensions/acpx
BIN="$EXT_DIR/node_modules/.bin/acpx"

if [ ! -d "$EXT_DIR" ]; then
    echo "FATAL: $EXT_DIR not found — is openclaw installed in this container?" >&2
    exit 1
fi

echo "[hotfix] Running as: $(id -un) (uid=$(id -u))"
if [ "$(id -u)" -ne 0 ]; then
    echo "FATAL: 'railway ssh' landed as uid $(id -u), not root."
    echo "       The install needs root to write under $EXT_DIR."
    echo "       Check whether Dockerfile.railway has gained a USER directive."
    exit 1
fi

# Idempotency: if the binary is already on the target version, skip the install.
if [ -x "$BIN" ]; then
    CURRENT="$("$BIN" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo unknown)"
    echo "[hotfix] Existing acpx version: $CURRENT"
    if [ "$CURRENT" = "$ACPX_VERSION" ]; then
        echo "[hotfix] Already on target version — nothing to install."
        exit 0
    fi
fi

cd "$EXT_DIR"
echo "[hotfix] Installing acpx@$ACPX_VERSION (--omit=dev --no-save) into $EXT_DIR ..."
npm install --omit=dev --no-save "acpx@$ACPX_VERSION"

# Verify.
echo "[hotfix] Verifying installed binary:"
"$BIN" --version

# Make sure uid 1000 (the user openclaw runs as) can read/execute everything.
# Default npm install as root produces 644/755 files anyway, but be explicit.
chmod -R a+rX "$EXT_DIR/node_modules"
echo "[hotfix] Done. ensureAcpx() will pick up the bundled binary on the next ACP spawn — no process restart required."
REMOTE

cat <<EOM

==> Live hotfix applied. Re-test with:
      sessions_spawn(runtime:"acp", agentId:"claude")
    on your WhatsApp / Gateway client. Expected: spawn succeeds and
    Claude replies in-thread.

==> WARNING: this fix lives only in the running container's filesystem.
    A Railway redeploy or container restart will wipe it. The durable
    fix is in Dockerfile.railway (ACPX_VERSION arg) — make sure that
    change is on the deployed branch before the next deploy, otherwise
    re-run this script.
EOM
