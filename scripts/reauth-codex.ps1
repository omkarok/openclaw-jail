# reauth-codex.ps1 - One-command recovery for "OAuth token refresh failed for openai-codex".
#
# Run from Windows Terminal or PowerShell:
#   powershell -ExecutionPolicy Bypass -File $env:USERPROFILE\openclaw-jail\scripts\reauth-codex.ps1
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

$ErrorActionPreference = "Stop"

$JailDir = Join-Path $env:USERPROFILE "openclaw-jail"
$Compose = Join-Path $JailDir "docker-compose.yml"
$AuthFile = Join-Path $JailDir "openclaw-home\.openclaw\.openclaw\agents\main\agent\auth.json"

if (-not (Test-Path $Compose)) {
    Write-Host "FATAL: $Compose not found. Are you running this on the right machine?" -ForegroundColor Red
    exit 1
}

# 1. Container must be up so we can exec into it
Write-Host "[1/4] Checking container state..." -ForegroundColor Cyan
$state = docker compose -f $Compose ps --format json | ConvertFrom-Json
if (-not $state -or $state.State -ne "running") {
    Write-Host "Container is not running. Starting it..." -ForegroundColor Yellow
    docker compose -f $Compose up -d
    Start-Sleep -Seconds 5
}

# 2. Backup current auth.json (if any)
Write-Host "[2/4] Backing up current auth.json..." -ForegroundColor Cyan
if (Test-Path $AuthFile) {
    $stamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
    $backup = "$AuthFile.bak-$stamp"
    Copy-Item $AuthFile $backup
    Write-Host "      Backup: $backup" -ForegroundColor Gray
    $beforeMtime = (Get-Item $AuthFile).LastWriteTime
} else {
    Write-Host "      No existing auth.json - first-time onboard." -ForegroundColor Gray
    $beforeMtime = [DateTime]::MinValue
}

# 3. Run onboard interactively (this is the step that needs a real TTY + your browser)
Write-Host "[3/4] Starting OAuth onboard - sign in with ChatGPT Plus when prompted..." -ForegroundColor Cyan
Write-Host "      A URL will print below. Open it, approve, come back." -ForegroundColor Yellow
Write-Host ""

# NOTE: no -T flag - we need TTY so openclaw can prompt
docker compose -f $Compose exec openclaw `
    openclaw onboard --auth-choice openai-codex `
        --no-install-daemon --skip-channels --skip-skills --skip-ui `
        --workspace /home/node/workspace

if ($LASTEXITCODE -ne 0) {
    Write-Host "FATAL: openclaw onboard exited with code $LASTEXITCODE." -ForegroundColor Red
    Write-Host "Run 'docker compose -f $Compose logs --tail 50 openclaw' for details." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 4. Verify the auth file was rewritten, then restart so gateway re-reads it
Write-Host ""
Write-Host "[4/4] Verifying new auth.json and restarting container..." -ForegroundColor Cyan
if (-not (Test-Path $AuthFile)) {
    Write-Host "FATAL: auth.json missing after onboard. Onboard did not complete." -ForegroundColor Red
    exit 1
}
$afterMtime = (Get-Item $AuthFile).LastWriteTime
if ($afterMtime -le $beforeMtime) {
    Write-Host "WARN: auth.json mtime did not advance ($afterMtime). Onboard may have been cancelled." -ForegroundColor Yellow
    Write-Host "      Re-run this script if the bot still fails to reply." -ForegroundColor Yellow
}

docker compose -f $Compose restart openclaw | Out-Null

Write-Host ""
Write-Host "DONE. Text your bot from your allow-listed number to confirm." -ForegroundColor Green
Write-Host "      Tail logs:  docker compose -f $Compose logs --follow openclaw" -ForegroundColor Gray
