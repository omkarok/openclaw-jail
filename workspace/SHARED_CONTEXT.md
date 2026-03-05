# Shared Context — OpenClaw System State
<!-- Written by Claude Code. Read + applied by Sherbyte at session start. -->
<!-- Format: Pending items have [ ]. Sherbyte marks them [applied YYYY-MM-DD] and moves to Applied. -->

Last updated: 2026-03-04 by Claude Code

---

## Pending Actions

- (none)

---

## Applied
- [applied 2026-03-04] READ AGENTS.md — new "Scope Gate" and "Worker Capabilities" sections added to Task Queue Intake. You now ask one clarifying question before queuing ambiguous deliverables (video, deck, post, etc.). Also documents what the worker cannot do (pip install, video render, TTS without API key).
- [applied 2026-03-04] READ AGENTS.md — a new section "Task Queue Intake" has been added. You are now the intake interface for the background worker. When anyone in OK's allowlist sends a message starting with !task in any WhatsApp DM or group, parse it and append a task to /home/node/workspace/task-queue/queue.json, then reply confirming it was queued. Full instructions in AGENTS.md section "Task Queue Intake".
- [applied 2026-03-02] SYNC TEST: Created `workspace/SYNC_TEST.md` with content: "Shared context sync verified at 2026-03-02 12:01 UTC. §14 is operational."
- [applied 2026-03-02] denyCommands: canvas.eval blocked; canvas.navigate + canvas.snapshot intentionally allowed (§11 scope: DM-only)
- [applied 2026-03-02] Rate limit set: maxAttempts=5, windowMs=60000, lockoutMs=1800000
- [applied 2026-03-02] groupAllowFrom locked to ["+919892787587"] — verify after every upgrade
- [applied 2026-03-02] sandbox.mode=off — do not change, container IS the sandbox (§10)
- [applied 2026-03-02] credentials dir chmod 700 verified
- [applied 2026-03-02] egress preflight active — container refuses to start if 169.254.169.254 reachable
- [applied 2026-03-02] dependency versions pinned in Dockerfile: openclaw@2026.3.1, playwright@1.58.2, node:22.22.0-bookworm
- [applied 2026-03-02] CVE scan clean — no critical CVEs, high findings (tar/fast-xml-parser) non-exploitable in this deployment

---

## System State Snapshot
- **openclaw version:** 2026.3.2 (bumped 2026-03-04)
- **agent model:** openai-codex/gpt-5.3-codex
- **security score:** 9/10 (residual: HTTPS exfiltration accepted cost — unfixable without breaking OpenAI/WhatsApp)
- **gateway port:** 18789 (lan bind, localhost-only from host)
- **workspace:** /home/node/workspace (rw)
- **WhatsApp:** connected, dmPolicy=allowlist, allowFrom=["+919892787587"]
- **canvas.eval:** gateway-blocked permanently
- **canvas.navigate/snapshot:** allowed, DM-only per §11
- **egress:** DOCKER-USER chain active in WSL2 — allows 80/443/53/123, blocks all else + metadata
- **Dependabot:** active on github.com/omkarok/openclaw-jail

---

## Background Worker (live as of 2026-03-04)
- **Agent ID:** `background-worker`
- **Model:** openai-codex/gpt-5.3-codex
- **Cron:** daily 08:00 IST (Asia/Kolkata) — cron ID: a9a8cc75-d136-4fc9-830f-0ae13cd628b1
- **Mandate:** `/home/node/workspace/agents/worker/MANDATE.md` v1.5
- **Task queue:** `/home/node/workspace/task-queue/queue.json` (schema v2)
- **Escalations:** `/home/node/workspace/escalations.json` (schema v2)
- **Run receipts:** `/home/node/workspace/agents/worker/runs/`
- **Standing tasks:** t001 (memory-digest), t002 (vault-health), t003 (run-health) — all recurring daily
- **Test run:** completed 2026-03-04, 3/3 tasks done, 0 escalations

## Sherbyte Role in Worker Loop
- Read `/home/node/workspace/escalations.json` on every heartbeat (30m)
- If unacknowledged escalations: send ONE consolidated WhatsApp alert to OK
- Dedup: do not re-alert same dedup_key within 2 hours (track in memory/heartbeat-state.json)
- Read latest run receipt in `/home/node/workspace/agents/worker/runs/` every ~2h
- Alert OK if receipt is >48h old or contains "ERROR"

---

## Architectural Decisions (context for reasoning)
- Claude Code (Anthropic) is the ops/orchestration layer — makes infrastructure decisions, commits code, manages Docker jail
- Sherbyte (GPT-5.3 via openclaw) is the user-facing agent — handles WhatsApp conversations, executes tasks, bridges escalations
- background-worker (GPT-5.3 via openclaw) is the headless execution layer — processes task queue autonomously, no WhatsApp access
- The three agents have distinct scopes: Claude Code owns the jail, Sherbyte owns runtime + escalation bridge, background-worker owns async execution
- Config changes to openclaw.json are owned by Claude Code; Sherbyte should only apply changes it finds in this file's Pending Actions section
- SECURITY.md is the canonical behaviour ruleset — Sherbyte reads it at every session boot
- workspace/.git is Sherbyte's memory snapshot repo — commit regularly
- Multi-agent bridge: `docker exec openclaw openclaw agent --to +919892787587 --message "..." [--deliver]`

---

## Issues / Handoff Notes (for Claude Code)
- 2026-03-05: Video render task `t-render-explainer-video` completed successfully and produced `/home/node/workspace/results/ma-explainer.webm`.
- Blocking issue for final delivery: this runtime has no `ffmpeg` binary (`ffmpeg: not found`), so Sherbyte cannot convert `.webm` → `.mp4` directly.
- Requested by OK: implement a durable fix so future video tasks can output attachment-ready MP4 (or provide an automatic fallback conversion path).

## How to use this file (for Claude Code)
1. Add actionable items to **Pending Actions** as `- [ ] <command or instruction>`
2. Sherbyte picks them up at next session start, applies silently, marks `[applied]`
3. Review Applied section to confirm propagation
4. Keep System State Snapshot current after major changes
5. **Path note:** Sherbyte's working root is `/home/node/workspace` — use absolute paths (e.g. `/home/node/workspace/file.md`) or bare filenames, never `workspace/file.md` (double-nests)
