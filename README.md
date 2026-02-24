# OpenClaw Docker Jail

A hardened, local-first Docker setup for [OpenClaw](https://github.com/openclaw/openclaw) with defense-in-depth, zero accidental deletes, and WhatsApp channel support.

**Setup time:** ~10 minutes (5 automated + 2 human OAuth steps)
**AI agents:** See [`CLAUDE.md`](./CLAUDE.md) — Claude Code, Cursor, or any agent can run this end-to-end.

---

## What this is

OpenClaw running in a Docker jail with:

- Read-only root filesystem
- Non-root container user (uid 1000)
- Only one writable area: `workspace/`
- Gateway on `127.0.0.1` only (never `0.0.0.0`)
- All capabilities dropped
- Auth rate limiting
- 9 gateway node commands explicitly denied
- WhatsApp channel locked to your number only

## Prerequisites

- Docker Desktop running
- `docker compose` available

```bash
docker --version
docker compose version
```

## Quick Start

```bash
# 1. Clone
git clone <this-repo> openclaw-jail
cd openclaw-jail

# 2. Create runtime directories (excluded from git)
mkdir -p openclaw-home workspace/quarantine logs

# 3. Build (pre-installs openclaw into image — required for read-only root)
docker compose build

# 4. Start
docker compose up -d

# 5. Onboard — MUST be done in a real terminal (OAuth requires TTY)
docker compose exec openclaw bash
# Then inside the container:
openclaw onboard --auth-choice openai-codex --no-install-daemon \
  --skip-channels --skip-skills --skip-ui \
  --workspace /home/node/workspace
```

Open the URL it prints, sign in with ChatGPT Plus, then come back and continue.

## Post-onboard configuration

After OAuth completes, run these from the host:

```bash
# Switch gateway to lan bind (required for Docker port forwarding)
docker compose exec openclaw openclaw config set gateway.bind lan

# Set allowed origins for Control UI
docker compose exec openclaw openclaw config set \
  gateway.controlUi.allowedOrigins '["http://127.0.0.1:18789","http://localhost:18789"]'

# Rate limiting
docker compose exec openclaw openclaw config set \
  gateway.auth.rateLimit '{"maxAttempts":10,"windowMs":60000,"lockoutMs":300000}'

# denyCommands
docker compose exec openclaw openclaw config set \
  gateway.nodes.denyCommands '["canvas.eval","canvas.navigate","canvas.snapshot","camera.list","location.get","photos.latest","motion.activity","motion.pedometer","system.notify"]'

# Restart into gateway mode
docker compose restart openclaw
```

## Connect

| Interface | URL |
|-----------|-----|
| Dashboard + WebChat | `http://localhost:18789/#token=<your-gateway-token>` |
| Canvas | `http://localhost:18789/__openclaw__/canvas/` |
| Browser control | `http://localhost:18791/` |

Find your token in `openclaw-home/.openclaw/.openclaw/openclaw.json`.

> Always include `#token=...` in the URL — without it the gateway rejects the connection.

## WhatsApp (optional)

```bash
# Set channel config (replace with your number)
docker compose exec openclaw openclaw config set channels.whatsapp.enabled true
docker compose exec openclaw openclaw config set channels.whatsapp.dmPolicy '"allowlist"'
docker compose exec openclaw openclaw config set channels.whatsapp.allowFrom '["+1XXXXXXXXXX"]'
docker compose exec openclaw openclaw config set channels.whatsapp.groupPolicy '"allowlist"'
docker compose exec openclaw openclaw config set channels.whatsapp.groupAllowFrom '["+1XXXXXXXXXX"]'

docker compose restart openclaw

# QR scan — must be done in a real terminal
docker compose exec openclaw bash
openclaw channels login --channel whatsapp --verbose
```

Scan the QR in WhatsApp → Settings → Linked Devices → Link a Device.

> **IMPORTANT:** Always use `dmPolicy: "allowlist"`. Never use `"pairing"` on a personal number — it sends pairing codes to anyone who texts the bot.

## Directory layout

```
openclaw-jail/
├── Dockerfile               # Pre-installs openclaw (required for read_only: true)
├── docker-compose.yml       # Hardened compose — no secrets
├── README.md
├── CLAUDE.md                # AI agent autonomous setup instructions
├── RUNBOOK.md               # Full operational reference
├── openclaw-home/           # Runtime: auth state, config (git-ignored)
├── workspace/               # Runtime: only writable area (git-ignored)
│   └── quarantine/          # Move-not-delete target
└── logs/                    # Runtime: gateway logs (git-ignored)
```

## Verification

```bash
docker port openclaw 18789             # → 127.0.0.1:18789
docker port openclaw 18791             # → 127.0.0.1:18791
docker compose exec openclaw bash -c "touch /_test && echo FAIL || echo PASS"  # → PASS (read-only)
docker compose exec openclaw openclaw security audit  # → 0 critical · 0 warn
docker compose exec openclaw openclaw channels status # → dm:allowlist
```

## Day-to-day

```bash
docker compose up -d       # start
docker compose down        # stop
docker logs -f openclaw    # live logs
```

See [`RUNBOOK.md`](./RUNBOOK.md) for full operations reference.
