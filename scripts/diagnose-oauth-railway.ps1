# diagnose-oauth-railway.ps1 - One-shot Railway diagnostic for the
# "OAuth token refresh failed every 4-5 days" issue.
#
# Why this exists: openclaw's per-agent file lock protects against races
# inside ONE agent, but if the install has multiple agent dirs
# (agents/main + agents/background-worker), each has its own auth.json
# with the same starting refresh_token. Both try to refresh
# independently. OpenAI's refresh-token rotation invalidates the loser,
# causing "refresh_token_reused" and the bot dies until next onboard.
#
# We also need to confirm Railway's volume is mounted where openclaw
# writes auth.json. Otherwise refreshed tokens don't survive container
# restarts.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\diagnose-oauth-railway.ps1 [service-name]
# Default service: openclaw

param([string]$Service = "openclaw")

$ErrorActionPreference = "Stop"

if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
    Write-Host "FATAL: railway CLI not installed. See scripts/reauth-codex-railway.ps1 for install steps." -ForegroundColor Red
    exit 1
}
try {
    railway whoami | Out-Null
    if ($LASTEXITCODE -ne 0) { throw }
} catch {
    Write-Host "FATAL: Not logged into Railway. Run: railway login" -ForegroundColor Red
    exit 1
}

Write-Host "==> Running diagnostic on Railway service '$Service'..." -ForegroundColor Cyan
Write-Host ""

$remoteScript = @'
echo "=== 1. Identity ==="
id
echo "HOME=$HOME  OPENCLAW_HOME=${OPENCLAW_HOME:-unset}"
echo

echo "=== 2. Agents directory ==="
AGENTS_ROOT="$HOME/.openclaw/.openclaw/agents"
if [ -d "$AGENTS_ROOT" ]; then
    ls -la "$AGENTS_ROOT"
    echo
    AGENT_COUNT=$(find "$AGENTS_ROOT" -maxdepth 1 -mindepth 1 -type d | wc -l)
    echo "Agent count: $AGENT_COUNT"
    if [ "$AGENT_COUNT" -gt 1 ]; then
        echo "WARNING: >1 agent dir found. This is the refresh-token race vector."
    fi
else
    echo "MISSING: $AGENTS_ROOT does not exist."
fi
echo

echo "=== 3. auth.json per agent ==="
for d in "$AGENTS_ROOT"/*/agent; do
    [ -d "$d" ] || continue
    AUTH="$d/auth.json"
    if [ -f "$AUTH" ]; then
        stat -c "%n  size=%s  mtime=%y  owner=%U:%G  perms=%a" "$AUTH"
        if command -v sha256sum >/dev/null 2>&1; then
            HASH=$(grep -oE "\"refresh\"\s*:\s*\"[^\"]+\"" "$AUTH" 2>/dev/null | sha256sum | cut -c1-16)
            echo "  refresh_token hash prefix: $HASH"
        fi
    else
        echo "$d/auth.json  MISSING"
    fi
done
echo

echo "=== 4. Volume / filesystem for openclaw home ==="
df -h "$HOME/.openclaw" 2>/dev/null | tail -2
echo "Mount points containing /home/node:"
mount | grep -E "node|openclaw" || echo "  (none - likely ephemeral container filesystem)"
echo

echo "=== 5. Recent OAuth refresh activity (last 100 matching lines) ==="
LOG="/var/log/openclaw/gateway.log"
if [ -f "$LOG" ]; then
    grep -iE "oauth|refresh|token|expired" "$LOG" 2>/dev/null | tail -100 || echo "  (no matches)"
else
    echo "  $LOG missing"
fi
echo

echo "=== 6. Running openclaw processes ==="
ps -ef | grep -E "openclaw|node" | grep -v grep
echo

echo "=== 7. openclaw doctor (structural check) ==="
openclaw doctor 2>&1 | tail -40 || true
echo

echo "=== DIAGNOSTIC COMPLETE ==="
'@

railway ssh --service $Service -- bash -c $remoteScript

Write-Host ""
Write-Host "==> Paste everything above this line into the chat." -ForegroundColor Green
