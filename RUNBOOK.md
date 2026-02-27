# OpenClaw Jail — RUNBOOK
**Version:** 1.9
**Last updated:** 2026-02-27
**OpenClaw version:** 2026.2.23
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
| Sleep / hibernate | Docker pauses — avoid; keep machine awake |
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
    "dmPolicy": "allowlist",
    "groupPolicy": "allowlist",
    "allowFrom": ["<your-whatsapp-number>"],
    "groupAllowFrom": ["<your-whatsapp-number>"]
  }
}
```

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
      "maxAttempts": 10,
      "windowMs": 60000,
      "lockoutMs": 300000
    }
  },
  "nodes": {
    "denyCommands": [
      "canvas.eval",
      "canvas.navigate",
      "canvas.snapshot",
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

**Why these commands are denied:**

| Command | Reason |
|---------|--------|
| `canvas.eval` | Executes arbitrary JS in the browser — highest risk |
| `canvas.navigate` | Agent-driven page navigation |
| `canvas.snapshot` | Screen capture via canvas |
| `camera.list` | Camera enumeration |
| `location.get` | GPS/location data |
| `photos.latest` | Photo library access |
| `motion.activity` | Motion sensor data |
| `motion.pedometer` | Step/motion data |
| `system.notify` | OS-level push notifications |

**Note:** Commands like `camera.snap`, `screen.record`, `sms.send`, `calendar.add`, `contacts.add`, `reminders.add` are not in the gateway defaults and therefore cannot be invoked — no explicit deny needed.

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

## Security Constraints (Non-negotiable)

- Container runs as **uid 1000 (non-root)**
- Root filesystem is **read-only**
- Gateway binds to **`lan`** inside container; Docker exposes on **`127.0.0.1` only**
- Control UI restricted to explicit origins: `http://127.0.0.1:18789`, `http://localhost:18789`
- Auth rate limiting: 10 attempts / 60s window, 5 min lockout
- All capabilities dropped (`cap_drop: ALL`)
- No new privileges (`no-new-privileges:true`)
- Only `workspace/` is writable; `openclaw-home/` persists auth state
- `pids_limit: 256`, `mem_limit: 6g`, `cpus: 4.0`
- `/tmp` is ephemeral tmpfs (`noexec,nosuid,nodev`)
- 9 gateway node commands explicitly denied (see table above)
