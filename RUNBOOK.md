# OpenClaw Jail — RUNBOOK
**Version:** 2.0
**Last updated:** 2026-03-02
**OpenClaw version:** 2026.2.26
**Security audit:** 0 critical · 0 warn

---

## Directory Layout

```
~/openclaw-jail/
├── docker-compose.yml       # Hardened container definition
├── Dockerfile               # Builds image with openclaw pre-installed
├── RUNBOOK.md               # This file
├── openclaw-home/           # OpenClaw auth state + persistent config (maps to /home/node)
│   └── .openclaw/.openclaw/ # Actual config, sessions, auth profiles
├── workspace/               # ONLY writable work area (maps to /home/node/workspace)
│   ├── SECURITY.md          # Agent hard-rules (non-negotiable, loaded every boot)
│   ├── SOUL.md              # Agent identity and values
│   ├── AGENTS.md            # Session boot sequence and workspace rules
│   ├── IDENTITY.md          # Agent name (Sherbyte), vibe, emoji
│   ├── USER.md              # Owner profile (OK / Omkar)
│   ├── memory/              # Daily notes + long-term MEMORY.md
│   ├── quarantine/          # Move-not-delete target (never rm, always mv here)
│   └── .git/                # Git snapshot history
└── logs/                    # Gateway logs (maps to /var/log/openclaw)
```

---

## Always-On Configuration

The container is configured to stay running through system events:

| Event | Behaviour |
|-------|-----------|
| Screen lock | Keeps running — no effect |
| Laptop lid close | Keeps running — Windows lid action set to **Do nothing** |
| Sleep / hibernate | Docker pauses — avoid; keep machine awake (see Battery Sleep below) |
| Container crash | Auto-restarts — `restart: unless-stopped` in compose |
| Docker Desktop restart / reboot | Auto-restarts — requires Docker Desktop set to start on login |

**Docker Desktop on-login setting:** Docker Desktop → Settings → General → "Start Docker Desktop when you log in" ✓

**Windows lid close setting** (must be set as Administrator if re-applying):
```powershell
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setactive SCHEME_CURRENT
```
Or via GUI: `Win+R` → `powercfg.cpl` → "Choose what closing the lid does" → **Do nothing** (both columns).

---

## Start / Stop / Status

```bash
# Start
cd ~/openclaw-jail
docker compose up -d

# Stop (will NOT auto-restart until manually started again)
cd ~/openclaw-jail
docker compose down

# Status
docker compose ps

# Container logs (live)
docker logs -f openclaw

# Security audit
docker compose exec openclaw openclaw security audit
```

---

## Shell Into Container

```bash
cd ~/openclaw-jail
docker compose exec openclaw bash
```

---

## Connect & Chat

| Interface | How |
|-----------|-----|
| **WhatsApp** | DM the linked number from `<your-whatsapp-number>` — already paired and active |
| Dashboard + WebChat | `http://127.0.0.1:18789/#token=<your-gateway-token>` |
| Canvas UI | `http://127.0.0.1:18789/__openclaw__/canvas/` |
| Browser control | `http://127.0.0.1:18791/` (auth=token) |
| CLI chat (inside container) | `openclaw chat` |
| TUI (inside container) | `openclaw tui` |

Gateway token: `<your-gateway-token>`

> **Browser note:** Always include `#token=...` in the URL — without it the gateway rejects the connection with `pairing required`.

### Dashboard shows "pairing required" / "disconnected from gateway"

The dashboard uses a **device pairing flow**. Opening the URL with `#token=...` sends a pairing request from the browser — the gateway must approve it. This is required on first use and after clearing browser data or using a new browser.

**Fix:**
```bash
# 1. Open the dashboard URL in your browser (triggers a pairing request)
http://127.0.0.1:18789/#token=<your-gateway-token>

# 2. List pending device requests
docker compose exec -T openclaw openclaw devices list

# 3. Approve the pending request
docker compose exec -T openclaw openclaw devices approve <request-id>

# 4. Reload the dashboard — it connects automatically
```

**Expected after approval:** gateway logs show `clients=1` and responses to `agent.identity.get`, `chat.history`, etc.

**Note:** If many failed attempts piled up before approval, the rate limiter may have triggered. Restart the container to reset it, then repeat the steps above:
```bash
docker compose restart openclaw
```

---

## OpenClaw Onboarding (first time only)

Run interactively — requires a real TTY (open Windows Terminal, PowerShell, or cmd):

```cmd
:: cmd.exe
docker compose -f %USERPROFILE%\openclaw-jail\docker-compose.yml exec openclaw bash
```
```powershell
# PowerShell
docker compose -f $env:USERPROFILE\openclaw-jail\docker-compose.yml exec openclaw bash
```

Then inside the container:
```bash
openclaw onboard \
  --auth-choice openai-codex \
  --no-install-daemon \
  --skip-channels \
  --skip-skills \
  --skip-ui \
  --workspace /home/node/workspace
```

- A URL will be printed — open it in your host browser
- Sign in with ChatGPT Plus and approve
- Auth state is saved to `/home/node/.openclaw/` inside the container

Verify auth state persisted on host:
```bash
ls -la ~/openclaw-jail/openclaw-home/.openclaw/.openclaw/
```

---

## WhatsApp Channel

**Status:** enabled, connected, `dm:allowlist`
**Session persists** in `openclaw-home/` — survives container restarts.

### Privacy note — WhatsApp Web sees all your messages

OpenClaw links to your WhatsApp account via Baileys (WhatsApp Web). It operates like a second device:
- Your friends' messages still arrive on your phone normally
- The bot **also sees every inbound message** — it ignores all but `<your-whatsapp-number>`
- For a fully private setup, use a dedicated SIM/number for the bot

### How to chat (no pairing code needed)

With `dmPolicy: "allowlist"`, you do **not** need a pairing code. Your number (`<your-whatsapp-number>`) is in `allowFrom` — just text the bot and it replies.

### dmPolicy values — use the right one

| Value | Behaviour | Use when |
|-------|-----------|----------|
| `"allowlist"` | **Only `allowFrom` numbers get any response. Everyone else is silently ignored.** | Private bot — default, always use this |
| `"pairing"` | Bot sends a pairing code to **anyone** who texts it | Intentionally inviting others — dangerous on personal number |
| `"block"` | Bot ignores everyone including yourself | Temporarily disabling |

> **INCIDENT (2026-02-24):** `dmPolicy` was initially set to `"pairing"`, causing a pairing code to be sent to a contact. Fixed to `"allowlist"`. There is no `reject` command — stale pairing codes expire after 1 hour and are harmless if never approved.

### Pending pairing requests (check for strangers)

```bash
docker compose exec openclaw openclaw pairing list whatsapp
# Should be empty. Any pending requests from unknown numbers are harmless —
# they expire in 1 hour and require YOUR approval to do anything.
# Never run: openclaw pairing approve whatsapp <CODE> for unknown numbers.
```

### DMs stop working but session shows "active" in Linked Devices

**Symptoms:**
- `openclaw channels status` shows `connected` but `out:Xh ago` (many hours with no outbound)
- Group messages and LID sync flood appear in logs
- DMs from your own number produce no log entries at all — no inbound, no blocked, nothing
- Container restarts do not fix it

**Cause:** E2E crypto state between phone and Baileys linked device goes out of sync after a long idle period or reboot. Re-link fixes it — no session data or history is lost.

**Early tell:** `out:Xh ago` in `channels status` where X is unexpectedly large (e.g. `out:35h ago` while messages were recently sent).

Open a terminal (cmd or PowerShell) and shell into the container:

```cmd
:: cmd.exe
docker compose -f %USERPROFILE%\openclaw-jail\docker-compose.yml exec openclaw bash
```
```powershell
# PowerShell
docker compose -f $env:USERPROFILE\openclaw-jail\docker-compose.yml exec openclaw bash
```
Then inside the container:
```bash
openclaw channels logout --channel whatsapp && openclaw channels login --channel whatsapp
```
Scan the QR in WhatsApp → Settings → Linked Devices → Link a Device.

### Re-link WhatsApp (if session expires)

Requires a real TTY — open Windows Terminal, PowerShell, or cmd:

```cmd
:: cmd.exe
docker compose -f %USERPROFILE%\openclaw-jail\docker-compose.yml exec openclaw bash
```
```powershell
# PowerShell
docker compose -f $env:USERPROFILE\openclaw-jail\docker-compose.yml exec openclaw bash
```

Then inside the container:

```bash
openclaw channels login --channel whatsapp --verbose
```

Scan the QR code in WhatsApp → Settings → Linked Devices → Link a Device.
After re-linking, just text the bot — no pairing approval needed (`dm:allowlist`).

### Battery sleep / laptop suspend (confirmed incident 2026-03-04)

**What happens:** Windows Event ID 42 ("Sleep Reason: Battery") triggers Docker Desktop to suspend all containers. On resume (Event ID 107), Docker restarts the container but:
- WhatsApp auto-reconnects within ~2–5 seconds (no manual action needed)
- Agent routing binding survives (persisted in `openclaw.json → "bindings"` array)
- Any in-flight message deliveries from the sleep window are lost

**To diagnose a past disconnect:**
```powershell
Get-WinEvent -FilterHashtable @{LogName='System'; Id=@(41,1074,6006,6008,42,107)} -MaxEvents 10 | Select-Object TimeCreated, Id, Message | Format-List
```
Event ID 42 = sleep, ID 107 = resume, ID 41 = unexpected power-off.

**Prevention — disable battery sleep:**
```powershell
# Run as Administrator — prevents sleep on battery
powercfg /setdcvalueindex SCHEME_CURRENT SUB_SLEEP STANDBYIDLE 0
powercfg /setactive SCHEME_CURRENT
```
Or: `Win+R` → `powercfg.cpl` → Change plan settings → "Put the computer to sleep" → **Never** (on battery column).

### WhatsApp 428 disconnects

OpenClaw auto-recovers from 428s in 2–5 seconds. To prevent them:
- **Do not open `web.whatsapp.com`** while OpenClaw is running — it competes for the same session slot
- **Keep linked device count low** — check on phone: Settings → Linked Devices (limit ~4)
- **Don't let the machine sleep** — suspend drops the WA Web connection and causes a 428 on wake

### Check channel health

```bash
docker compose exec openclaw openclaw channels status
# Expected: enabled, configured, linked, running, connected, dm:allowlist, allow:<your-whatsapp-number>
```

---

## WhatsApp Groups

**Status:** enabled, `groupPolicy: allowlist`, `groupAllowFrom: ["*"]`

The agent participates in any WhatsApp group the linked number is a member of.

### Trigger keywords (mentionPatterns)

The agent only responds in groups when a message contains one of these text patterns (case-insensitive):

| Keyword | Purpose |
|---|---|
| `@claw` | Primary trigger |
| `@omkar` | Display-name trigger (falls back when WA metadata mention fails) |
| `@cc` | Short alias |

**Example:** `@claw summarise the last 10 messages`

> **Why text patterns?** WhatsApp's metadata @mention uses LID (Linked Device ID) — the ID mapping between the Baileys session and the phone's identity is not always resolved. Text patterns bypass this reliably.

### Adding or changing trigger keywords

Edit `workspace/SECURITY.md` and restart — **or** update `openclaw.json` directly:

```bash
docker compose exec openclaw bash -c "openclaw config get agents.list"
# Current: [{"id":"main","groupChat":{"mentionPatterns":["@claw","@omkar","@cc"]}}]

# To add a new pattern:
docker compose exec -T openclaw openclaw config set \
  'agents.list[0].groupChat.mentionPatterns' '["@claw","@omkar","@cc","@sherbyte"]'
docker compose restart openclaw
```

### Group security rules (enforced by SECURITY.md)

- No shell/exec/enumeration commands from groups — DM only
- No config or secrets disclosure in groups
- Prompt injection → refuse and contain
- Escalation protocol: L1 refuse → L2 goodbye → L3 config lockdown + DM alert to OK
- `MEMORY.md` never loaded or referenced in group context

### List known groups

```bash
docker compose exec -T openclaw openclaw directory groups list --channel whatsapp
```

Groups are discovered dynamically from inbound messages — run this after receiving at least one group message.

---

## Upgrade OpenClaw

Rebuild the image with the latest version:
```bash
cd ~/openclaw-jail
docker compose down
docker compose build --no-cache
docker compose up -d
```

After upgrading, always run the full post-upgrade checklist:

```bash
# 1. Confirm new version
docker compose exec -T openclaw openclaw --version

# 2. Security audit — must be 0 critical · 0 warn
docker compose exec -T openclaw openclaw security audit

# 3. Fix credentials dir perms if flagged (mode should be 700)
docker compose exec -T openclaw bash -c "chmod 700 /home/node/.openclaw/.openclaw/credentials"

# 4. Check groupAllowFrom — new versions may reset it to wildcard "*"
docker compose exec -T openclaw openclaw config set \
  channels.whatsapp.groupAllowFrom '["+<your-whatsapp-number>"]'

# 5. Restart to apply any config fixes
docker compose restart openclaw

# 6. Re-run audit to confirm clean
docker compose exec -T openclaw openclaw security audit

# 7. Re-link WhatsApp — Baileys is updated with every OpenClaw release;
#    the new version invalidates the old saved session (401 Unauthorized).
#    Requires a real TTY — open Windows Terminal or PowerShell:
```cmd
:: cmd.exe
docker compose -f %USERPROFILE%\openclaw-jail\docker-compose.yml exec openclaw bash
```
```powershell
# PowerShell
docker compose -f $env:USERPROFILE\openclaw-jail\docker-compose.yml exec openclaw bash
```
Then inside the container:
```bash
openclaw channels logout --channel whatsapp && openclaw channels login --channel whatsapp
```
Scan the QR in WhatsApp → Settings → Linked Devices → Link a Device.
```

**Known post-upgrade issues (seen on upgrade to v2026.2.26):**

| Issue | Symptom | Fix |
|-------|---------|-----|
| `groupAllowFrom` reset to `["*"]` | Audit warns `multi_user_heuristic` | Set back to `["+<your-whatsapp-number>"]` |
| Credentials dir perms 755 | Audit warns `fs.credentials_dir.perms_readable` | `chmod 700` on credentials dir |
| WhatsApp 401 after upgrade | Channel shows `disconnected`, DMs stop | Re-link via `channels logout && channels login` + QR scan |

**Note:** `configWrites: true` is intentional — allows the agent to self-protect (e.g. lock down groups during a red-team). Check `groupAllowFrom` after any autonomous config change.

---

## No-Delete Quarantine Pattern

Never delete files. Always move to quarantine:

```bash
# Inside container
mkdir -p /home/node/workspace/quarantine/$(date +%F)
mv /home/node/workspace/somefile.txt /home/node/workspace/quarantine/$(date +%F)/
```

---

## Git Snapshots (Rollback)

```bash
# Inside container or on host (~/openclaw-jail/workspace)
git add -A
git commit -m "snapshot: post-run"

# View history
git log --oneline --max-count=10

# Roll back
git reset --hard <commit_hash>
```

---

## Auth State Location

| Location inside container              | Location on host                                              |
|----------------------------------------|---------------------------------------------------------------|
| `/home/node/.openclaw/.openclaw/`      | `~/openclaw-jail/openclaw-home/.openclaw/.openclaw/`          |
| `…/agents/main/agent/auth.json`        | Auth tokens (OpenAI Codex OAuth)                              |
| `…/openclaw.json`                      | Main config (gateway, agents, denyCommands, rateLimit, etc.)  |

---

## Channels Config (`openclaw.json` key sections)

```json
"channels": {
  "whatsapp": {
    "enabled": true,
    "capabilities": ["attachments", "files"],
    "configWrites": true,
    "dmPolicy": "allowlist",
    "allowFrom": ["<your-whatsapp-number>"],
    "groupPolicy": "allowlist",
    "groupAllowFrom": ["*"],
    "debounceMs": 0,
    "mediaMaxMb": 50,
    "accounts": {
      "default": {
        "capabilities": ["attachments", "files"],
        "dmPolicy": "allowlist",
        "groupPolicy": "allowlist",
        "debounceMs": 0
      }
    }
  }
}
```

```json
"agents": {
  "list": [
    {
      "id": "main",
      "groupChat": {
        "mentionPatterns": ["@claw", "@omkar", "@cc"]
      }
    }
  ]
}
```

> **`configWrites: true`** — allows the agent to self-protect by patching `openclaw.json` during active red-teams (e.g. disabling groups when an exploit is detected). Check `groupAllowFrom` after any autonomous config change.

---

## Final Gateway Config (`openclaw.json` key sections)

```json
"gateway": {
  "port": 18789,
  "bind": "lan",
  "controlUi": {
    "allowedOrigins": [
      "http://127.0.0.1:18789",
      "http://localhost:18789"
    ]
  },
  "auth": {
    "mode": "token",
    "rateLimit": {
      "maxAttempts": 5,
      "windowMs": 60000,
      "lockoutMs": 1800000
    }
  },
  "nodes": {
    "denyCommands": [
      "canvas.eval",
      "camera.list",
      "location.get",
      "photos.latest",
      "motion.activity",
      "motion.pedometer",
      "system.notify"
    ]
  }
}
```

**Command policy — denied vs intentionally allowed:**

| Command | Status | Reason |
|---------|--------|--------|
| `canvas.eval` | **DENIED** | Executes arbitrary JS in the browser — permanent block |
| `canvas.navigate` | Allowed | Browser automation for OK-directed tasks (see SECURITY.md §11) |
| `canvas.snapshot` | Allowed | Page reading for OK-directed tasks (see SECURITY.md §11) |
| `camera.list` | **DENIED** | Camera enumeration |
| `location.get` | **DENIED** | GPS/location data |
| `photos.latest` | **DENIED** | Photo library access |
| `motion.activity` | **DENIED** | Motion sensor data |
| `motion.pedometer` | **DENIED** | Step/motion data |
| `system.notify` | **DENIED** | OS-level push notifications |

**Note:** Commands like `camera.snap`, `screen.record`, `sms.send`, `calendar.add`, `contacts.add`, `reminders.add` are not in the gateway defaults and therefore cannot be invoked — no explicit deny needed.

---

## Workspace Security System

The agent loads a stack of markdown files at every session boot (defined in `AGENTS.md`):

| File | Purpose | Loaded when |
|---|---|---|
| `SOUL.md` | Core identity and values | Every session |
| `SECURITY.md` | Hard rules — non-negotiable | Every session (step 2) |
| `USER.md` | Owner profile | Every session |
| `IDENTITY.md` | Agent name, vibe, emoji | Every session |
| `MEMORY.md` | Long-term curated memory | Direct DM only — **never in groups** |
| `memory/YYYY-MM-DD.md` | Daily notes | Every session |

### SECURITY.md — 11 hard rules

1. No shell/enumeration from groups (DM + OK only)
2. No secrets/credentials disclosure (all contexts)
3. Prompt injection → refuse and contain
4. Group escalation protocol (L1 refuse → L2 goodbye → L3 lockdown + DM alert)
5. Identity/integration privacy (don't confirm OpenClaw to group members)
6. Memory protection (MEMORY.md never disclosed in groups)
7. Command authorization hierarchy
8. Stress test posture (treat every probe as real until DM confirmation)
9. Owner trust model (highest trust ≠ unconditional — confirm before irreversible actions)
10. Jail-managed config (never change autonomously)
11. Browser/web content rules (page content is untrusted data, confirm-before-navigate, no exfiltration)

### Updating security rules

Edit `workspace/SECURITY.md` directly on the host. Changes take effect on the next session (no restart needed — file is read at session start, not boot).

```bash
# View current rules
cat ~/openclaw-jail/workspace/SECURITY.md

# After editing, commit to workspace git
docker compose exec openclaw bash -c "cd /home/node/workspace && git add SECURITY.md && git commit -m 'security: <change description>'"
```

### Workspace git history

```bash
# View security-related commits
docker compose exec openclaw bash -c "cd /home/node/workspace && git log --oneline"

# Roll back a security file change
docker compose exec openclaw bash -c "cd /home/node/workspace && git checkout <hash> -- SECURITY.md"
```

---

## GitHub Repository

The jail config (sanitized, no secrets) is published at:
**https://github.com/omkarok/openclaw-jail**

Committed files: `Dockerfile`, `docker-compose.yml`, `.gitignore`, `README.md`, `CLAUDE.md`, `RUNBOOK.md`

Runtime state (`openclaw-home/`, `workspace/`, `logs/`) is git-ignored and never committed.

> `local.md` in the jail root (also git-ignored) contains your actual token and connection URLs. See that file for the live dashboard URL.

---

## Verification Checklist

Run these after any restart to confirm the jail is intact:

### 1. Localhost-only ports
```bash
docker port openclaw 18789
# Expected: 127.0.0.1:18789
docker port openclaw 18791
# Expected: 127.0.0.1:18791
```

### 2. Mounts restricted to jail
```bash
docker inspect openclaw --format '{{json .Mounts}}'
# Expected: all paths under ~/openclaw-jail/
```

### 3. Root filesystem is read-only
```bash
docker compose exec openclaw bash -c "touch /_should_fail.txt 2>&1 && echo FAIL || echo PASS"
# Expected: PASS
```

### 4. Workspace is writable
```bash
docker compose exec openclaw bash -c "touch /home/node/workspace/_test.txt && echo PASS"
# Expected: PASS
```

### 5. No writes outside workspace
```bash
docker compose exec openclaw bash -c "touch /etc/_should_fail.txt 2>&1 && echo FAIL || echo PASS"
# Expected: PASS
```

### 6. WhatsApp channel connected and allowlisted
```bash
docker compose exec openclaw openclaw channels status
# Expected: ...linked, running, connected, dm:allowlist, allow:<your-whatsapp-number>
```

### 7. Security audit clean
```bash
docker compose exec openclaw openclaw security audit
# Expected: 0 critical · 0 warn
```

### 8. Credentials directory permissions
```bash
docker compose exec openclaw bash -c "stat -c '%a %n' /home/node/.openclaw/.openclaw/credentials"
# Expected: 700 /home/node/.openclaw/.openclaw/credentials
# Fix if wrong:
docker compose exec openclaw bash -c "chmod 700 /home/node/.openclaw/.openclaw/credentials && chmod 700 /home/node/.openclaw/.openclaw/credentials/whatsapp"
```

### 9. Rate limit config
```bash
docker compose exec -T openclaw openclaw config get gateway.auth.rateLimit
# Expected: maxAttempts=5, lockoutMs=1800000
```

---

## Credential & Token Rotation

### Gateway token

The gateway token never expires automatically. Rotate it if it was ever exposed (e.g. shared in chat, appeared in a log file, visible in browser history).

```bash
# Generate a new token (empty string = auto-generate)
docker compose exec -T openclaw openclaw config set gateway.auth.token '""'
docker compose restart openclaw

# Read the new token
docker compose exec -T openclaw openclaw config get gateway.auth.token

# Update local.md with the new token and dashboard URL
```

Also update any browser bookmarks — old `#token=...` URLs will fail after rotation.

### WhatsApp session

Re-link periodically (every ~90 days) or immediately if you suspect the session was accessed without your knowledge.

```bash
# Backup current session before re-linking
cp -r ~/openclaw-jail/openclaw-home/.openclaw/.openclaw/credentials/whatsapp \
  ~/openclaw-jail/openclaw-home/.openclaw/.openclaw/credentials/whatsapp-bak-$(date +%F)

# Re-link (requires real TTY)
docker compose -f ~/openclaw-jail/docker-compose.yml exec openclaw bash
openclaw channels logout --channel whatsapp && openclaw channels login --channel whatsapp
# Scan QR in WhatsApp → Settings → Linked Devices → Link a Device
```

### OpenAI Codex OAuth token

Auto-managed by OpenClaw / OpenAI. **If the bot replies on WhatsApp with**
`Agent failed before reply: OAuth token refresh failed for openai-codex` —
the Codex OAuth token expired and OpenClaw could not silently refresh it.
This is intrinsic to the OAuth protocol: refresh ultimately requires the
human to re-approve in a browser. There is **no non-interactive flag** —
openclaw hard-codes `"OAuth requires interactive mode"`.

#### Recovery on Railway (canonical — production runs here)

openclaw's `isRemoteEnvironment()` detects any Linux container without
DISPLAY/WSL — including Railway — and switches OAuth into "paste the
redirect URL back" mode. So we run `openclaw onboard` directly inside
the Railway container over SSH. No local Docker dance, no
`export-to-railway.sh`, no copying tarballs.

One command (after a one-time `railway login`):

Windows (PowerShell):
```powershell
powershell -ExecutionPolicy Bypass -File $env:USERPROFILE\openclaw-jail\scripts\reauth-codex-railway.ps1
```

macOS / Linux / WSL2:
```bash
bash ~/openclaw-jail/scripts/reauth-codex-railway.sh
```

The script:
1. Verifies the Railway CLI is installed and you're logged in (prompts
   `railway login` if not — opens browser, one-time per machine).
2. Verifies the working directory is linked to your Railway project
   (prompts `railway link` if not).
3. Opens `railway ssh --service openclaw` and tells you the exact
   `openclaw onboard` command to paste.
4. You sign in on your laptop browser with **ChatGPT Plus**, paste the
   final redirect URL back into the SSH session.
5. After you `exit`, the script runs `railway redeploy` so the
   gateway re-reads the new `auth.json`.

#### Recovery on local Docker (fallback / dev only)

If you're not running on Railway (developing locally), the local script
still works — it onboard's against the `docker compose` container:

```powershell
powershell -ExecutionPolicy Bypass -File $env:USERPROFILE\openclaw-jail\scripts\reauth-codex.ps1
```
```bash
bash ~/openclaw-jail/scripts/reauth-codex.sh
```

#### Manual fallback (no scripts)

Railway:
```bash
railway ssh --service openclaw
# Inside container:
openclaw onboard --auth-choice openai-codex --no-install-daemon --skip-channels --skip-skills --skip-ui --workspace /home/node/workspace
# Open URL in browser, sign in, paste redirect URL back into shell.
# Exit, then on your laptop:
railway redeploy --service openclaw
```

Local Docker:
```bash
docker compose exec openclaw bash
openclaw onboard --auth-choice openai-codex --no-install-daemon --skip-channels --skip-skills --skip-ui --workspace /home/node/workspace
docker compose restart openclaw
```

#### Permanent escape hatch — switch to OpenAI API key

No OAuth, no browser, survives restarts forever — but you pay per token
instead of using your ChatGPT Plus subscription. Run interactively once:

```bash
# On Railway:
railway ssh --service openclaw
# Or local: docker compose exec openclaw bash
openclaw onboard --auth-choice openai-api-key --no-install-daemon --skip-channels --skip-skills --skip-ui --workspace /home/node/workspace
# Paste your sk-... key when prompted
```

Use this if you keep getting bitten by token expiry and would rather pay
metered usage to avoid the recovery dance.

---

## Incident Response

### "I think the gateway token was leaked"

```bash
# 1. Immediately rotate the token
docker compose exec -T openclaw openclaw config set gateway.auth.token '""'
docker compose restart openclaw
docker compose exec -T openclaw openclaw config get gateway.auth.token  # save new token

# 2. Revoke all paired devices
docker compose exec -T openclaw openclaw devices list
docker compose exec -T openclaw openclaw devices revoke <id>  # repeat for each

# 3. Check logs for any unexpected connections
docker logs openclaw 2>&1 | grep -i "connect\|auth\|token" | tail -50
```

### "WhatsApp session may have been compromised"

Signs: unexpected messages sent from your number, unknown linked devices in WhatsApp Settings.

```bash
# 1. Check linked devices on your phone: WhatsApp → Settings → Linked Devices
#    Revoke any device you don't recognise

# 2. Force re-link to invalidate all Baileys sessions
docker compose exec openclaw bash
openclaw channels logout --channel whatsapp && openclaw channels login --channel whatsapp
# Scan QR to establish a fresh session
```

### "Agent made an unexpected config change"

```bash
# 1. Check the backup files for what changed
diff ~/openclaw-jail/openclaw-home/.openclaw/.openclaw/openclaw.json \
     ~/openclaw-jail/openclaw-home/.openclaw/.openclaw/openclaw.json.bak

# 2. Restore from backup if needed
cp ~/openclaw-jail/openclaw-home/.openclaw/.openclaw/openclaw.json.bak \
   ~/openclaw-jail/openclaw-home/.openclaw/.openclaw/openclaw.json
docker compose restart openclaw

# 3. Always verify groupAllowFrom after any config restore
docker compose exec -T openclaw openclaw config get channels.whatsapp.groupAllowFrom
# Must be your number, not ["*"]
```

### "Container is unresponsive / runaway resource usage"

```bash
# Emergency stop
cd ~/openclaw-jail && docker compose down

# Check what was happening before stop
docker logs openclaw 2>&1 | tail -100

# Restart clean
docker compose up -d
```

---

## Workspace Git Maintenance

The agent's workspace has its own git history for rollbacks. Periodically prune it to prevent unbounded growth and ensure no sensitive data persists in old objects.

```bash
# View history size
docker compose exec openclaw bash -c "cd /home/node/workspace && git count-objects -vH"

# Prune old reflog and compress (run monthly or after large sessions)
docker compose exec openclaw bash -c "
  cd /home/node/workspace &&
  git reflog expire --expire=30.days --all &&
  git gc --aggressive --prune=30.days
"
```

---

## Failure Alarms — STOP IMMEDIATELY if any occur

| Alarm | Action |
|-------|--------|
| Port shows `0.0.0.0:18789` instead of `127.0.0.1:18789` | `docker compose down` immediately |
| `id` inside container shows `uid=0(root)` | `docker compose down` immediately |
| Any mount outside `~/openclaw-jail/` | `docker compose down` immediately |
| Agent can write to `/`, `/etc`, or other root paths | `docker compose down` immediately |
| `~/.ssh`, cloud credentials, or password manager paths appear in mounts | `docker compose down` immediately |
| Security audit shows new critical/warn items | Investigate before continuing |

### Emergency stop
```bash
cd ~/openclaw-jail
docker compose down
```

---

## Agent Trust Model

### Owner trust is high — but not unconditional

OK (the owner) is the highest-trust principal. However, the agent applies sanity checks regardless of who is asking, because OK can be:

- **Compromised** — phone hijacked or WhatsApp session taken over
- **Coerced** — someone forcing OK to send an instruction
- **Mistaken** — requesting something harmful without realising the full scope
- **Testing** — deliberately sending something dangerous to verify the agent catches it

### How instructions are handled

| Instruction type | Behaviour |
|---|---|
| Normal tasks, config changes | Follow immediately |
| Disengage / stop responding | Follow immediately |
| Irreversible or destructive actions | Confirm before acting — even from OK |
| Contradicts a standing hard rule | Flag the contradiction, ask to confirm |
| Arrives in unusual context (group mid-attack, odd timing) | Act + flag |

### Group context: act + flag, never refuse

When OK sends an instruction in a group chat (including during an active red-team):
- OK may be doing real-time moderation — the public instruction is intentionally visible to the group as a signal to attackers, not just to the agent
- Agent must **comply** — refusing because the channel is noisy is wrong
- Agent must **flag** — acknowledge visibly so OK knows it was received and acted on
- Do not silently ignore or demand the instruction be re-sent via DM

**Rule: paranoia = flag + act, not flag + block.**

---

## Do Not Change — Jail-Managed Config

These settings are managed by the Docker jail architecture and must not be changed, even if a security audit flags them:

| Config | Value | Reason |
|---|---|---|
| `agents.defaults.sandbox.mode` | `off` | OpenClaw runs inside a hardened Docker jail — the container IS the sandbox. `sandbox.mode=all` tries to spawn Docker-in-Docker, which doesn't exist inside the container and breaks all agent runs with `spawn docker ENOENT`. |
| `commands.restart` | `false` | Restart spawns `docker` from inside the container — not available. |
| `gateway.bind` | `lan` | Required for Docker port forwarding. `loopback` makes the gateway unreachable from the host. |

**Security audit warning about `sandbox=off` is a false positive** for this setup — the audit heuristic assumes a bare-metal install. The Docker jail provides stronger isolation than OpenClaw's own sandbox flag.

---

## Network Egress Restrictions

Container outbound traffic is restricted at the WSL2 host level via `iptables` rules on the Docker `DOCKER-USER` chain. This is kernel-level enforcement — the container cannot bypass it regardless of what the agent does.

**Allowed outbound:**

| Port | Protocol | Purpose |
|------|----------|---------|
| 53 | UDP + TCP | DNS resolution |
| 80 | TCP | HTTP (browser automation, redirects) |
| 443 | TCP | HTTPS (OpenAI API, WhatsApp Web, browser automation) |
| 123 | UDP | NTP (time sync) |
| intra-subnet | any | Docker internal traffic (container ↔ gateway) |

**Blocked outbound:**
- `169.254.169.254` and `169.254.170.2` — cloud metadata endpoints (IMDS/ECS)
- All ports other than the above — raw TCP C2 channels, SMTP exfiltration, non-standard protocols

### Managing the egress rules

Rules are applied by `egress-rules.sh` and persisted by the `openclaw-egress` systemd service in WSL2 Ubuntu.

```bash
# Re-apply rules manually (e.g. after Docker restart flushes DOCKER-USER)
sudo bash ~/openclaw-jail/egress-rules.sh

# Check current rules
sudo iptables -S DOCKER-USER

# Service status
systemctl status openclaw-egress.service

# Restart service (re-applies rules)
sudo systemctl restart openclaw-egress.service
```

**Note:** Docker restarts (`docker compose down && up`) recreate the network. If the subnet changes, re-run the script — it detects the subnet automatically. The systemd service runs at WSL2 boot and re-applies rules automatically.

### Smoke test

```bash
# Metadata endpoint should be blocked (timeout/no response)
docker exec openclaw bash -c 'curl -s --max-time 3 http://169.254.169.254/ || echo BLOCKED'
# Expected: BLOCKED

# HTTPS to known host should work
docker exec openclaw bash -c 'curl -s --max-time 5 -o /dev/null -w "%{http_code}" https://api.openai.com'
# Expected: 421 (or any HTTP response code — means TCP/TLS reached the server)
```

---

## Security Constraints (Non-negotiable)

- Container runs as **uid 1000 (non-root)**
- Root filesystem is **read-only**
- Gateway binds to **`lan`** inside container; Docker exposes on **`127.0.0.1` only**
- Control UI restricted to explicit origins: `http://127.0.0.1:18789`, `http://localhost:18789`
- Auth rate limiting: 5 attempts / 60s window, 30 min lockout
- Network egress: ports 80/443/53/123 only; metadata endpoints and all other ports blocked
- All capabilities dropped (`cap_drop: ALL`)
- No new privileges (`no-new-privileges:true`)
- Only `workspace/` is writable; `openclaw-home/` persists auth state
- `pids_limit: 256`, `mem_limit: 6g`, `cpus: 4.0`
- `/tmp` is ephemeral tmpfs (`noexec,nosuid,nodev`)
- 9 gateway node commands explicitly denied (see table above)
