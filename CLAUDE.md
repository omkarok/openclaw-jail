# CLAUDE.md — Autonomous Setup for AI Agents

This file is the authoritative setup script for **Claude Code, Cursor, or any AI agent**.
Follow it sequentially. Most steps are fully automatable; human steps are clearly marked.

**Estimated time:** 5–10 minutes (plus ~2 min human OAuth + ~1 min human QR scan)

---

## What you are setting up

OpenClaw AI agent inside a hardened Docker jail:
- Auth: OpenAI Codex OAuth (ChatGPT Plus)
- Gateway: `ws://127.0.0.1:18789` (localhost-only)
- Read-only root filesystem, non-root user, all caps dropped
- WhatsApp channel locked to owner's number only
- Security audit target: 0 critical · 0 warn

---

## Gotchas — read before running anything

These are hard-won lessons. Skipping them costs hours.

| # | Gotcha | Correct behaviour |
|---|--------|-------------------|
| 1 | OpenClaw gateway port is **18789**, not 8080 | Use 18789 everywhere |
| 2 | `read_only: true` in compose requires openclaw to be **pre-installed in the image** | Use the Dockerfile — never `npm install` at container startup |
| 3 | `gateway.bind = loopback` **breaks Docker port forwarding** — the gateway binds to the container's `127.0.0.1`, unreachable from host | Set `gateway.bind = lan` after onboard |
| 4 | `gateway.bind = lan` requires **explicit `controlUi.allowedOrigins`** or the gateway refuses to start | Always set origins when using lan bind |
| 5 | `openclaw onboard` OAuth **requires an interactive TTY** — `exec -T` or `--non-interactive` both fail with "OAuth requires interactive mode" | Tell the human to run it in a real terminal |
| 6 | `dmPolicy: "pairing"` sends pairing codes to **anyone** who texts the bot | Always set `dmPolicy: "allowlist"` for private use |
| 7 | `denyCommands` only works for commands **already in `allowCommands` defaults** — denying unknown names silently does nothing and triggers a security audit warning | Only deny known-valid command names |
| 8 | Browser dashboard needs **`#token=...` in the URL hash** — the page loads without it but the WebSocket connect frame won't include the token | Always open `http://localhost:18789/#token=<token>` |
| 9 | WhatsApp uses **Baileys (WhatsApp Web)** — it links to an existing account and sees all messages | Recommend a dedicated number; ensure `allowFrom` is set before linking |
| 10 | After re-linking WhatsApp with `dmPolicy: "allowlist"`, **no pairing approval step is needed** — `allowFrom` is the access control | Just text the bot after re-link |
| 11 | The `@openclaw/acpx` extension lazily runs `npm install acpx@<pinned>` into `/usr/local/lib/node_modules/openclaw/extensions/acpx/node_modules` on first ACP spawn — that path is **root-owned and read-only at runtime**, so the install fails with EACCES and `sessions_spawn(runtime:"acp", ...)` returns "ACP runtime backend is currently unavailable" | Pre-bake the install during `docker compose build` (handled by the `ACPX_VERSION` arg in `Dockerfile`); after bumping `OPENCLAW_VERSION`, also bump `ACPX_VERSION` to match the new `ACPX_PINNED_VERSION` in the extension's `src/config.ts` |

---

## Phase 0 — Verify prerequisites

```bash
docker --version         # need 20+
docker compose version   # need v2+
```

If Docker Desktop is not running, stop and ask the human to start it before continuing.

---

## Phase 1 — Create directory layout

```bash
mkdir -p ~/openclaw-jail/{workspace/quarantine,openclaw-home,logs}
cd ~/openclaw-jail
```

Expected:
```
openclaw-jail/
├── Dockerfile
├── docker-compose.yml
├── openclaw-home/
├── workspace/
│   └── quarantine/
└── logs/
```

---

## Phase 2 — Build the image

```bash
cd ~/openclaw-jail
docker compose build
```

This pulls `node:22-bookworm` and runs `npm install -g openclaw@latest` inside the image.
Takes ~3–4 minutes on first run. Subsequent builds use cache.

Verify:
```bash
docker compose run --rm openclaw openclaw --version

# Confirm the ACP runtime backend (acpx) was baked into the image — must print
# the pinned version (currently 0.1.15) without "EACCES" / "permission denied".
docker compose run --rm --entrypoint /usr/local/lib/node_modules/openclaw/extensions/acpx/node_modules/.bin/acpx \
  openclaw --version
```

---

## Phase 3 — Start the container (hold mode)

The compose file starts in hold mode (`tail -f /dev/null`) for initial onboarding.

```bash
cd ~/openclaw-jail
docker compose up -d
docker compose ps   # → Status: Up
docker compose exec -T openclaw id        # → uid=1000(node)
docker compose exec -T openclaw openclaw --version
```

---

## Phase 4 — OAuth onboarding (HUMAN STEP — cannot be automated)

**Tell the human:**

> I need you to complete a one-time OAuth step in a terminal. This cannot be done automatically.
>
> 1. Open **Windows Terminal** or **PowerShell**
> 2. Run:
>    ```powershell
>    docker compose -f $env:USERPROFILE\openclaw-jail\docker-compose.yml exec openclaw bash
>    ```
> 3. Inside the container, run:
>    ```bash
>    openclaw onboard --auth-choice openai-codex --no-install-daemon \
>      --skip-channels --skip-skills --skip-ui \
>      --workspace /home/node/workspace
>    ```
> 4. Open the URL it prints in your browser
> 5. Sign in with your **ChatGPT Plus** account and approve
> 6. Come back and tell me when it's done

After the human confirms, verify auth state persisted:

```bash
ls ~/openclaw-jail/openclaw-home/.openclaw/.openclaw/agents/main/agent/auth.json
# Must exist
```

---

## Phase 5 — Configure gateway (automated)

Run these in order — each requires the container to be running:

```bash
# Required: lan bind so Docker port forwarding works (loopback = unreachable from host)
docker compose exec -T openclaw openclaw config set gateway.bind lan

# Required when bind=lan: explicit allowed origins for the Control UI
docker compose exec -T openclaw openclaw config set \
  gateway.controlUi.allowedOrigins '["http://127.0.0.1:18789","http://localhost:18789"]'

# Rate limiting (required when bind != loopback)
docker compose exec -T openclaw openclaw config set \
  gateway.auth.rateLimit '{"maxAttempts":10,"windowMs":60000,"lockoutMs":300000}'

# denyCommands — only include names confirmed to be in allowCommands defaults
docker compose exec -T openclaw openclaw config set \
  gateway.nodes.denyCommands '["canvas.eval","canvas.navigate","canvas.snapshot","camera.list","location.get","photos.latest","motion.activity","motion.pedometer","system.notify"]'
```

Switch to gateway mode — edit `docker-compose.yml` `command:` to:

```yaml
command: >
  bash -lc "openclaw gateway --port 18789 --verbose 2>&1 | tee /var/log/openclaw/gateway.log"
```

Then restart:

```bash
cd ~/openclaw-jail
docker compose up -d
```

Wait 8 seconds, then verify:

```bash
docker logs openclaw 2>&1 | grep "listening"
# Expected: [gateway] listening on ws://0.0.0.0:18789
```

---

## Phase 6 — Run verification checklist

Run all checks and report pass/fail for each:

```bash
# 1. Localhost-only ports
docker port openclaw 18789   # → 127.0.0.1:18789
docker port openclaw 18791   # → 127.0.0.1:18791

# 2. All mounts under openclaw-jail
docker inspect openclaw --format '{{json .Mounts}}'

# 3. Root filesystem read-only
docker compose exec -T openclaw bash -c "touch /_fail 2>&1 && echo FAIL || echo PASS"
# → PASS

# 4. Workspace writable
docker compose exec -T openclaw bash -c "touch /home/node/workspace/_ok && echo PASS"
# → PASS

# 5. /etc not writable
docker compose exec -T openclaw bash -c "touch /etc/_fail 2>&1 && echo FAIL || echo PASS"
# → PASS

# 6. Security audit
docker compose exec -T openclaw openclaw security audit
# → 0 critical · 0 warn

# 7. ACP runtime backend (acpx) available
docker compose exec -T openclaw \
  /usr/local/lib/node_modules/openclaw/extensions/acpx/node_modules/.bin/acpx --version
# → 0.1.15  (or whatever ACPX_PINNED_VERSION the current openclaw expects)
```

---

## Phase 7 — WhatsApp channel (optional, ask human first)

**Ask the human for their WhatsApp phone number** (with country code, e.g. `+1XXXXXXXXXX`).

```bash
# Set policy BEFORE linking — dmPolicy MUST be "allowlist", never "pairing"
docker compose exec -T openclaw openclaw config set channels.whatsapp.enabled true
docker compose exec -T openclaw openclaw config set channels.whatsapp.dmPolicy '"allowlist"'
docker compose exec -T openclaw openclaw config set channels.whatsapp.groupPolicy '"allowlist"'
docker compose exec -T openclaw openclaw config set channels.whatsapp.allowFrom '["<PHONE_NUMBER>"]'
docker compose exec -T openclaw openclaw config set channels.whatsapp.groupAllowFrom '["<PHONE_NUMBER>"]'

cd ~/openclaw-jail && docker compose restart openclaw
```

Then tell the human to run the QR scan in a real terminal (requires TTY):

> Run in Windows Terminal / PowerShell:
> ```powershell
> docker compose -f $env:USERPROFILE\openclaw-jail\docker-compose.yml exec openclaw bash
> ```
> Then:
> ```bash
> openclaw channels login --channel whatsapp --verbose
> ```
> Scan the QR: WhatsApp → Settings → Linked Devices → Link a Device.
> Tell me when done.

After the human confirms, verify:

```bash
docker compose exec -T openclaw openclaw channels status
# Expected: ...linked, running, connected, dm:allowlist, allow:<PHONE_NUMBER>
```

With `dmPolicy: "allowlist"`, no pairing approval step is needed — just text the bot.

---

## Phase 8 — Generate RUNBOOK.md

Write a `RUNBOOK.md` to `~/openclaw-jail/` containing:
- All start/stop/upgrade commands
- Connect & chat URLs (with the actual gateway token from `openclaw.json`)
- WhatsApp channel status, re-link steps, dmPolicy reference table
- Full gateway config snapshot from `openclaw.json`
- Verification checklist (including `openclaw channels status` and `security audit`)
- Failure alarms and emergency stop
- Security constraints summary

---

## Completion criteria

Before declaring setup complete, all of the following must be true:

- [ ] `openclaw --version` works inside container
- [ ] `docker port openclaw 18789` → `127.0.0.1:18789`
- [ ] `touch /_fail` inside container → permission denied
- [ ] `touch /home/node/workspace/_ok` inside container → success
- [ ] `openclaw security audit` → 0 critical · 0 warn
- [ ] ACP backend: `extensions/acpx/node_modules/.bin/acpx --version` prints the pinned version (no EACCES)
- [ ] Auth state exists: `openclaw-home/.openclaw/.openclaw/agents/main/agent/auth.json`
- [ ] Gateway log shows `listening on ws://0.0.0.0:18789`
- [ ] (If WhatsApp) `channels status` → `dm:allowlist`
- [ ] `RUNBOOK.md` written and complete
