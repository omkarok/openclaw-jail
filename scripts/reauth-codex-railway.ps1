# reauth-codex-railway.ps1 - Systemic OAuth recovery for openclaw on Railway.
#
# Replaces the old flow (OAuth on local Docker → export-to-railway.sh → restart)
# with a single direct path: OAuth happens INSIDE the Railway container.
#
# openclaw auto-detects remote/VPS environments and switches OAuth to a
# "paste the redirect URL back" flow that works over SSH. We just need to
# `railway ssh` into the running service, run `openclaw onboard`, sign in on
# the laptop, paste the URL back. Fresh auth.json lands directly on Railway -
# no local Docker, no tar export, no copy step.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\reauth-codex-railway.ps1 [service-name]
# Default service-name: openclaw

param([string]$Service = "openclaw")

$ErrorActionPreference = "Stop"

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Ok($msg)       { Write-Host "      OK $msg" -ForegroundColor Green }
function Warn($msg)     { Write-Host "      ! $msg" -ForegroundColor Yellow }
function Die($msg)      { Write-Host "`nFATAL: $msg" -ForegroundColor Red; exit 1 }

# ── 1. Railway CLI must be installed ──────────────────────────────────────────
Step "1/5" "Checking Railway CLI..."
if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
    @"
Railway CLI not found. Install it:
  scoop:  scoop install railway
  winget: winget install Railway.RailwayCLI
  npm:    npm install -g @railway/cli
  docs:   https://docs.railway.com/guides/cli#installing-the-cli
Then re-run this script.
"@ | Write-Host -ForegroundColor Yellow
    exit 1
}
Ok ((railway --version 2>&1 | Select-Object -First 1))

# ── 2. Railway must be logged in ──────────────────────────────────────────────
Step "2/5" "Checking Railway auth..."
try {
    $whoami = railway whoami 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw "not logged in" }
} catch {
    Warn "Not logged in to Railway."
    Write-Host "      Running 'railway login' — your browser will open. Sign in, come back."
    railway login
    if ($LASTEXITCODE -ne 0) { Die "railway login failed" }
    $whoami = railway whoami 2>&1 | Out-String
}
Ok ("Logged in as: " + $whoami.Trim())

# ── 3. Project must be linked ─────────────────────────────────────────────────
Step "3/5" "Checking project link..."
$status = railway status 2>&1
if ($LASTEXITCODE -ne 0) {
    Warn "Current directory is not linked to a Railway project."
    Write-Host "      Running 'railway link' — pick the openclaw project."
    railway link
    if ($LASTEXITCODE -ne 0) { Die "railway link failed" }
    $status = railway status 2>&1
}
Ok ("Linked: " + (($status | Out-String) -replace "`r?`n", " "))

# ── 4. Drop into the Railway container and run onboard ────────────────────────
Step "4/5" "Opening SSH session into '$Service' on Railway..."
@"

  When the shell opens, paste this command and follow the prompts:

  -----------------------------------------------------------------
  openclaw onboard --auth-choice openai-codex --no-install-daemon ``
    --skip-channels --skip-skills --skip-ui --workspace /home/node/workspace
  -----------------------------------------------------------------

  openclaw will detect it's in a remote environment and print a URL.
  Open the URL in your laptop browser, sign in with ChatGPT Plus,
  approve, then COPY THE FINAL REDIRECT URL from your browser's
  address bar (it looks like http://localhost:1455/?code=...) and
  paste it back into the SSH session.

  When onboard finishes (you'll see "OpenAI OAuth complete"),
  type 'exit' to leave the SSH session — this script will then
  redeploy the service so the gateway picks up new credentials.

"@ | Write-Host

Read-Host "Press Enter to open the Railway SSH session"

railway ssh --service $Service
if ($LASTEXITCODE -ne 0) {
    Die "railway ssh failed. Common causes: service name wrong, service not deployed, no shell binary in image."
}

# ── 5. Redeploy so the gateway re-reads auth.json ─────────────────────────────
Step "5/5" "Redeploying '$Service' so the gateway picks up new credentials..."
railway redeploy --service $Service --yes 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Ok "Redeploy triggered."
} else {
    Warn "Could not auto-redeploy. Run manually: railway redeploy --service $Service"
}

Write-Host ""
Write-Host "DONE. Watch logs to confirm the bot recovers:" -ForegroundColor Green
Write-Host "  railway logs --service $Service" -ForegroundColor Gray
Write-Host ""
Write-Host "Then text your bot from your allow-listed number. It should reply."
