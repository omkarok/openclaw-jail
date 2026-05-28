#!/usr/bin/env bash
# reauth-codex-railway.sh - Systemic OAuth recovery for openclaw running on Railway.
#
# Replaces the old flow (OAuth on local Docker → export-to-railway.sh → restart)
# with a single direct path: OAuth happens INSIDE the Railway container.
#
# openclaw auto-detects remote/VPS environments (isRemoteEnvironment() returns
# true on any Linux container without DISPLAY) and switches OAuth to a
# "paste the redirect URL back" flow that works over SSH. So we just need to
# `railway ssh` into the running service, run `openclaw onboard`, sign in on
# our laptop, paste the URL back. The fresh auth.json lands directly on
# Railway's volume — no local Docker, no tar export, no copy step.
#
# Usage:
#   bash scripts/reauth-codex-railway.sh [service-name]
# Default service-name: openclaw

set -euo pipefail

SERVICE="${1:-openclaw}"

step() { printf "\n\033[1;36m[%s]\033[0m %s\n" "$1" "$2"; }
ok()   { printf "      \033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "      \033[33m!\033[0m %s\n" "$1"; }
die()  { printf "\n\033[1;31mFATAL:\033[0m %s\n" "$1" >&2; exit 1; }

# ── 1. Railway CLI must be installed ──────────────────────────────────────────
step "1/5" "Checking Railway CLI..."
if ! command -v railway >/dev/null 2>&1; then
    cat >&2 <<EOF
Railway CLI not found. Install it:
  npm:    npm install -g @railway/cli
  brew:   brew install railway
  scoop:  scoop install railway
  binary: https://docs.railway.com/guides/cli#installing-the-cli
Then re-run this script.
EOF
    exit 1
fi
ok "$(railway --version 2>&1 | head -1)"

# ── 2. Railway must be logged in ──────────────────────────────────────────────
step "2/5" "Checking Railway auth..."
if ! railway whoami >/dev/null 2>&1; then
    warn "Not logged in to Railway."
    echo "      Running 'railway login' — your browser will open. Sign in, come back."
    railway login || die "railway login failed"
fi
ok "Logged in as: $(railway whoami 2>&1 | head -1)"

# ── 3. Project must be linked ─────────────────────────────────────────────────
step "3/5" "Checking project link..."
if ! railway status >/dev/null 2>&1; then
    warn "Current directory is not linked to a Railway project."
    echo "      Running 'railway link' — pick the openclaw project."
    railway link || die "railway link failed"
fi
ok "Linked: $(railway status 2>&1 | grep -E 'Project|Environment' | head -2 | tr '\n' ' ')"

# ── 4. Drop into the Railway container and run onboard ────────────────────────
step "4/5" "Opening SSH session into '$SERVICE' on Railway..."
cat <<EOF

  When the shell opens, paste this command and follow the prompts:

  -----------------------------------------------------------------
  openclaw onboard --auth-choice openai-codex --no-install-daemon \\
    --skip-channels --skip-skills --skip-ui --workspace /home/node/workspace
  -----------------------------------------------------------------

  openclaw will detect it's in a remote environment and print a URL.
  Open the URL in your laptop browser, sign in with ChatGPT Plus,
  approve, then COPY THE FINAL REDIRECT URL from your browser's
  address bar (it'll look like http://localhost:1455/?code=...) and
  paste it back into the SSH session.

  When onboard finishes (you'll see "OpenAI OAuth complete"),
  type 'exit' to leave the SSH session — this script will then
  redeploy the service so the gateway picks up new credentials.

EOF
read -r -p "Press Enter to open the Railway SSH session..." _

# Don't `exec` — we want to come back and redeploy after the user exits
if ! railway ssh --service "$SERVICE"; then
    die "railway ssh failed. Common causes: service name wrong, service not deployed, no shell binary in image."
fi

# ── 5. Redeploy so the gateway re-reads auth.json ─────────────────────────────
step "5/5" "Redeploying '$SERVICE' so the gateway picks up new credentials..."
if railway redeploy --service "$SERVICE" --yes 2>/dev/null; then
    ok "Redeploy triggered."
else
    warn "Could not auto-redeploy. Run manually: railway redeploy --service $SERVICE"
fi

echo
echo "DONE. Watch logs to confirm the bot recovers:"
echo "  railway logs --service $SERVICE"
echo
echo "Then text your bot from your allow-listed number. It should reply."
