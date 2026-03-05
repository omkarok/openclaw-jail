# Multi-Agent AI Orchestration: OpenClaw + Sherbyte
## Conference Explainer Deck — 15 Slides

---

## SLIDE 1: The AI That Works While You Sleep
**Headline:** While you were asleep, your AI completed 8 tasks, upgraded its own mandate, and messaged you the results.
**Bullets:**
- OpenClaw: cross-channel AI runtime and security-hardened gateway
- Sherbyte: your personal AI bridge — always listening, always delivering
- Background Worker: autonomous agent that executes while you're offline
- 0 task failures across the entire production run
**Speaker Notes:** Open with the hook — this isn't a demo, this is a system running in production right now. The numbers on this slide are real: 8+ tasks, 0 failures, 5 WhatsApp notifications delivered while the owner slept. Let that land before advancing.
**Visual:** Full-bleed dark background. Large centered title "OpenClaw + Sherbyte" in bold white. Beneath it, a single animated stat counter: "8 tasks completed · 0 failures · 5 notifications delivered · tonight." Bottom-left: system version badge "v2026.2.26".

---

## SLIDE 2: The Problem
**Headline:** Every AI assistant you've used resets when you close the tab — that's not intelligence, that's a search bar with a personality.
**Bullets:**
- Reactive-only: AI waits for a message; it never initiates
- Stateless by default: close the session, lose the thread — forever
- No execution layer: AI can plan tasks but cannot run, track, or retry them
- No proactive delivery: results sit in a chat window; nothing reaches you unless you check
**Speaker Notes:** This slide names the pain that every technical audience has felt. Emphasize "reactive" as the core failure mode — great AI that can't act autonomously is just an expensive autocomplete. The missing piece isn't model quality; it's runtime infrastructure.
**Visual:** Split panel. Left: screenshot mockup of a generic chat assistant with "Session ended" greyed out. Right: four red-crossed icons labeled Reactive, Stateless, No Execution, No Delivery. Minimalist, high-contrast.

---

## SLIDE 3: Our Answer
**Headline:** Three layers: a runtime, a personal bridge, and a headless worker — each doing exactly one job, doing it autonomously.
**Bullets:**
- Layer 1 — OpenClaw: multi-channel gateway, tool routing, security enforcement
- Layer 2 — Sherbyte: real-time agent, heartbeat loop, notification delivery to WhatsApp
- Layer 3 — Background Worker: cron-driven executor, reads MANDATE.md, drains the task queue
- The layers communicate through flat JSON files — auditable, crash-safe, zero coupling
**Speaker Notes:** This is the "aha" slide. The key insight to emphasize: each layer is independently replaceable, and the communication medium (JSON files) is the simplest possible contract. There is no message bus, no shared database — just queue.json, notifications.json, and escalations.json.
**Visual:** Three horizontal swimlanes stacked vertically. Lane 1: "OpenClaw" (blue). Lane 2: "Sherbyte" (green). Lane 3: "Background Worker" (amber). Arrows show JSON files flowing between lanes. Clean, architectural, no decorative clutter.

---

## SLIDE 4: Architecture Diagram
**Headline:** One gateway, three channels, two agents, five JSON files — the entire system fits on one page.
**Bullets:**
- OpenClaw gateway binds at ws://127.0.0.1:18789 — localhost-only, security-hardened
- Sherbyte connects as a named agent; Background Worker runs fully headless
- All state lives in the workspace: queue.json, notifications.json, escalations.json, MANDATE.md
- Security audit result: 0 critical · 0 warn — read-only root filesystem, non-root uid=1000
**Speaker Notes:** Walk the audience through the diagram left to right. User input enters via WhatsApp or Discord. OpenClaw routes it to Sherbyte. Sherbyte writes to queue.json. The worker — running on its own cron clock — picks up the task, executes it, and writes results back. Sherbyte's heartbeat closes the loop by delivering notifications to the user's WhatsApp DM.
**Visual:** Large ASCII-art / styled block diagram, centered, monospace font:

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                      USER CHANNELS                               │
  │   📱 WhatsApp          💬 Discord          🌐 Web / API          │
  └───────────┬──────────────────┬────────────────────┬─────────────┘
              │                  │                    │
              ▼                  ▼                    ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │              OPENCLAW GATEWAY  (ws://127.0.0.1:18789)            │
  │   Security: read-only FS · uid=1000 · 0 critical · 0 warn        │
  │   Tool routing · dmPolicy:allowlist · rate limiting              │
  └───────────┬──────────────────────────────────────────────────────┘
              │
    ┌─────────┴──────────┐
    │                    │
    ▼                    ▼
┌─────────────┐    ┌──────────────────────────────┐
│   SHERBYTE  │    │      BACKGROUND WORKER        │
│  Personal   │    │  Headless · Cron 08:00 IST    │
│  AI Bridge  │    │  Reads: MANDATE.md (v1.4)     │
│             │    │  Runs:  queue.json drain loop  │
│  30-min     │    │                               │
│  heartbeat  │    │  Self-scheduled · Autonomous  │
└──────┬──────┘    └───────────────┬───────────────┘
       │                           │
       │        ┌──────────────────┴──────────────────┐
       │        │           WORKSPACE FILES            │
       │        │                                      │
       │        │  queue.json          (schema v2)     │
       │        │  notifications.json  (sent:false→true)│
       │        │  escalations.json    (dedup_key)     │
       │        │  MANDATE.md          (v1.4)          │
       │        │  results/            (task outputs)  │
       └────────┴──────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  WhatsApp DM to Owner  │
              │  "Task complete: ..."  │
              └────────────────────────┘
```

---

## SLIDE 5: OpenClaw — The Runtime Fabric
**Headline:** OpenClaw is the surface the agents live on — it handles channels, security, and tool routing so the agents don't have to.
**Bullets:**
- Binds at ws://127.0.0.1:18789 — localhost-only; no public exposure without explicit config
- Channels: WhatsApp (Baileys/WhatsApp Web), Discord, Web — each with independent policy
- dmPolicy: "allowlist" + allowFrom per number — zero-trust DM access by default
- Security audit: 0 critical · 0 warn — read-only root FS, dropped caps, non-root uid=1000
**Speaker Notes:** OpenClaw is the foundation everything else rests on. Highlight the security posture: the default config ships with `dmPolicy: "allowlist"`, meaning the bot responds to no one until you explicitly whitelist their number. The hardened Docker jail — read-only filesystem, non-root user, all capabilities dropped — means a compromised agent cannot modify its own runtime.
**Visual:** Left column: OpenClaw logo / wordmark with version badge. Center: security checklist with green checkmarks — "0 critical", "0 warn", "uid=1000", "read-only FS", "allowlist DM", "rate limited". Right column: channel icons (WhatsApp, Discord, Web) connected via lines to the gateway node.

---

## SLIDE 6: Sherbyte — Personal AI Bridge
**Headline:** Sherbyte is the human-facing half of the system — it listens in real time, escalates failures, and delivers results before you ask.
**Bullets:**
- Named agent inside OpenClaw — maintains persistent session, no session resets
- 30-minute heartbeat loop: wakes, checks notifications.json and escalations.json, delivers, sleeps
- Parses `!task` commands from WhatsApp groups — writes structured entries to queue.json
- Delivers task results as WhatsApp DMs — proactively, without the user polling anything
**Speaker Notes:** Sherbyte is the personality layer, but don't let that undersell the engineering. The 30-minute heartbeat is the heartbeat of the whole notification system — it's what makes the system feel alive without burning continuous API quota. Emphasize that escalations.json uses dedup_key, so a repeatedly-failing task produces exactly one escalation alert, not a flood.
**Visual:** Phone mockup (WhatsApp UI) on the right showing a received DM: "Task t004 complete: Notification system shipped. 5/5 tests passing." On the left: Sherbyte agent diagram with heartbeat pulse animation. Arrow labeled "30-min loop" connecting them. Top of diagram: "!task research: X" input message in a group chat.

---

## SLIDE 7: Background Worker — Autonomous Executor
**Headline:** No browser, no session, no human in the loop — the worker reads its orders from MANDATE.md and executes until the queue is empty.
**Bullets:**
- Headless agent: launched by cron at 08:00 IST daily, no UI, no interactive session
- Reads MANDATE.md (v1.4) on startup — this is its constitution, not just a config file
- Drains queue.json in priority order: urgent → high → normal → low
- Handles crash recovery: any task stuck in_progress > 30 minutes is reset and retried
**Speaker Notes:** The Background Worker is where the real magic happens — it's the proof that "autonomous" isn't marketing copy. MANDATE.md is intentionally human-readable: it describes goals, constraints, and operating procedures in plain English, and the worker interprets them as binding instructions. The 30-minute stale timeout means the system self-heals from crashes without human intervention.
**Visual:** Terminal / CLI aesthetic. Dark background. Simulated cron log output:

```
[08:00:01 IST] Background Worker v1.4 starting...
[08:00:02 IST] Reading MANDATE.md... OK (v1.4)
[08:00:02 IST] Loading queue.json... 3 tasks pending
[08:00:03 IST] Executing t009 [priority: urgent]...
[08:00:47 IST] t009 complete. Writing result.
[08:00:47 IST] Checking stale tasks... 0 found.
[08:00:48 IST] Delivering notifications... 1 queued.
```

---

## SLIDE 8: Task Queue + DAG
**Headline:** queue.json is not a list — it's a dependency graph with priorities, backoff, and self-healing crash recovery.
**Bullets:**
- Schema v2: each task has id, priority, depends_on[], status, attempts, run_after timestamp
- DAG via depends_on: tasks block until all listed dependencies reach status "done"
- Priority sort: urgent > high > normal > low — re-evaluated every drain cycle
- Exponential backoff on failure: attempt 1 → 1 min, attempt 2 → 2 min, attempt 3 → 4 min...
**Speaker Notes:** Show the schema and walk through a concrete example: task t007 depended on t005 and t006 completing first. That's a real dependency chain from the production run. The backoff formula prevents a flaky external API from hammering your worker into a retry storm. Crash recovery — resetting stale in_progress tasks — is what makes the system production-grade rather than a demo.
**Visual:** Two-panel layout. Left panel: JSON code block showing a real queue.json task entry:

```json
{
  "id": "t007",
  "title": "failure spike detection",
  "priority": "high",
  "status": "pending",
  "depends_on": ["t005", "t006"],
  "attempts": 0,
  "max_attempts": 3,
  "run_after": null,
  "created_at": "2026-02-26T08:00:00Z"
}
```

Right panel: DAG visualization — nodes t004, t005, t006, t007, t008 connected by directed arrows showing dependency order. Color-coded: green = done, amber = in_progress.

---

## SLIDE 9: The Self-Improvement Sprint
**Headline:** The worker ran tasks t004–t008, shipped four production features, and upgraded its own mandate three versions — overnight, alone.
**Bullets:**
- t004: Notifications system — worker → notifications.json → Sherbyte → WhatsApp DM
- t005: Per-attempt receipts — every task attempt logged with timestamp and result hash
- t006: Weekly digest — auto-generated summary of the week's task history
- t007: Failure spike detection — alerts when error rate exceeds threshold; MANDATE upgraded v1.1 → v1.4
**Speaker Notes:** This is the hero story of the deck. Don't rush it. The worker started with MANDATE v1.1 — a minimal set of operating instructions. It identified that it lacked a notification channel, a receipt system, a digest, and failure alerting. It created and executed tasks to build each one. After t008 — the sprint summary — it updated MANDATE.md to v1.4 to reflect its new capabilities. No human wrote the upgrade.
**Visual:** Vertical timeline on the right side of the slide. Five nodes: t004 → t005 → t006 → t007 → t008. Each node shows task name and a one-line outcome. Left of the timeline: MANDATE version badge that animates v1.1 → v1.2 → v1.3 → v1.4. Bottom callout box: "Total time elapsed: one overnight run. Human involvement: 0."

---

## SLIDE 10: !task — AI from Any WhatsApp Group
**Headline:** Type `!task research: X` in a WhatsApp group, walk away — the result arrives in your DM before you remember you asked.
**Bullets:**
- User types `!task research: quantum error correction` in any allowlisted WhatsApp group
- Sherbyte parses the command prefix, extracts task type and payload, writes to queue.json
- Background Worker picks it up in the next drain cycle, executes, writes result to results/
- Sherbyte's next heartbeat finds notifications.json entry (sent:false), delivers DM, marks sent:true
**Speaker Notes:** Walk through the full end-to-end flow slowly — this is the most satisfying sequence in the deck. The round-trip from WhatsApp group message to WhatsApp DM result requires zero manual steps, zero polling, and zero configuration per task. The `!task` prefix is intentionally minimal — it's the entire API surface for the end user.
**Visual:** Horizontal flow diagram with four stages connected by arrows:

```
[WhatsApp Group]          [Sherbyte]           [Worker]            [WhatsApp DM]
"!task research:    →    Parses prefix,   →   Executes,      →    "Research done:
 X"                      writes queue.json    writes result        results/ · t011"
```

Below the flow: simulated WhatsApp group message on the left, simulated DM notification on the right. Timestamp delta shown: "~8 minutes end-to-end."

---

## SLIDE 11: The Notification Loop
**Headline:** notifications.json is the contract between the worker and the world — a dead-simple delivery guarantee with no message broker required.
**Bullets:**
- Worker writes to notifications.json: `{"id": "n001", "message": "...", "sent": false}`
- Sherbyte heartbeat (every 30 min) reads all entries where sent == false
- Delivers each unsent notification to the owner's WhatsApp DM via OpenClaw
- Marks sent: true atomically — idempotent, crash-safe, no duplicate deliveries
**Speaker Notes:** The beauty of this design is its simplicity under failure. If Sherbyte crashes mid-delivery, the notification stays sent:false and gets delivered on the next heartbeat. If the worker crashes after writing but before the heartbeat, nothing is lost. The entire delivery guarantee is enforced by a single boolean field in a JSON file — no Kafka, no Redis, no SQS.
**Visual:** Three-step diagram with a large central notifications.json file icon. Arrow from "Worker" on the left writing to the file. Arrow from "Sherbyte Heartbeat" on the right reading the file. Below the file: two rows showing the state change:

```
Before:  {"id": "n005", "message": "t008 complete", "sent": false}
After:   {"id": "n005", "message": "t008 complete", "sent": true}
```

Timestamp label: "Delivery window: max 30 minutes."

---

## SLIDE 12: Production Results
**Headline:** This is not a benchmark — these numbers are from a live system running in a Docker jail on a single laptop.
**Bullets:**
- 8+ tasks completed autonomously — 0 failures, 0 manual retries, 0 human interventions
- 5 WhatsApp notifications delivered — all marked sent:true, none duplicated
- MANDATE.md self-upgraded 3 times: v1.1 → v1.2 → v1.3 → v1.4 without human authorship
- Security posture held throughout: 0 critical · 0 warn on every `openclaw security audit` run
**Speaker Notes:** Let the metrics breathe. The audience will mentally compare these to their own internal tooling — the bar of "0 failures, 0 manual retries" is one that most production pipelines don't meet. The MANDATE self-upgrade is the most surprising stat: the system wrote its own operating procedures as a byproduct of executing tasks. That's the recursive loop that makes this architecture interesting.
**Visual:** Four large stat cards arranged in a 2x2 grid. Card 1: "8+ Tasks" / "Completed Autonomously" (green). Card 2: "0 Failures" / "Zero retries, zero interventions" (green). Card 3: "5 Notifications" / "Delivered to WhatsApp" (blue). Card 4: "MANDATE v1.4" / "Self-upgraded 3 versions" (amber). Bottom footnote: "Platform: Docker jail · Single laptop · Production run 2026-02-26."

---

## SLIDE 13: What This Enables
**Headline:** When AI has a runtime, a task queue, and a delivery layer, "assistant" becomes the wrong word — you have an operator.
**Bullets:**
- Proactive AI: system initiates contact when something happens, not when you remember to ask
- Auditable execution: every task has a JSON record — id, priority, attempts, result, timestamp
- Ops infrastructure for agents: the DAG queue pattern works for any autonomous agent, any model
- Compounding autonomy: each self-improvement sprint expands what the next sprint can do
**Speaker Notes:** Frame this as infrastructure, not a product — the audience should leave thinking about how to wire their own agent into this pattern. The DAG queue is model-agnostic: swap Sherbyte for any LLM-backed agent and the orchestration layer stays identical. The "compounding autonomy" point deserves a beat — the worker is measurably more capable after v1.4 than it was at v1.1, and that happened automatically.
**Visual:** Single bold word "OPERATOR" centered, replacing "assistant." Beneath it: a capability expansion diagram showing concentric circles. Inner circle: "Execute tasks." Middle: "Track and retry." Outer: "Self-improve and notify." Each ring labeled with the corresponding system component.

---

## SLIDE 14: How to Build This
**Headline:** Three components, five JSON files, one cron job — you can wire this pattern in a weekend.
**Bullets:**
- Step 1 — Runtime: deploy OpenClaw, configure gateway.bind, add your channel (WhatsApp or Discord)
- Step 2 — Agent: define MANDATE.md with goals and constraints; connect your LLM as a named agent
- Step 3 — Queue: implement queue.json schema v2 — add depends_on, priority, attempts, run_after
- Glue: notifications.json (sent:false/true) + escalations.json (dedup_key) close the delivery loop
**Speaker Notes:** Keep this practical and sequential. The audience should be able to take a photo of this slide and start building. Emphasize that MANDATE.md is just a markdown file — the agent reads it as a text prompt. The hardest part isn't the code; it's deciding what your agent's mandate actually is. Everything else is JSON and a cron job.
**Visual:** Three-column layout, each column a step card. Step 1: OpenClaw logo + terminal command `openclaw gateway --port 18789`. Step 2: MANDATE.md file icon + excerpt `## Goals\n- Process task queue\n- Self-improve`. Step 3: queue.json snippet showing schema v2 fields. Below all three: horizontal arrow labeled "Weekend project → Production system."

---

## SLIDE 15: What's Next + Q&A
**Headline:** The system already works — what it does next depends on what you put in MANDATE.md.
**Bullets:**
- Multi-worker parallelism: shard queue.json by priority tier, run concurrent workers
- Agent-to-agent delegation: Sherbyte spawns sub-tasks that Background Worker executes
- External triggers: GitHub webhooks, calendar events, email — anything that can write queue.json
- Open question: when should the agent refuse a MANDATE update it wrote itself?
**Speaker Notes:** End on the open question — it's the most intellectually honest thing you can say about autonomous systems. The technical roadmap is less interesting than the governance question: if the worker is allowed to update MANDATE.md, what are the constraints on that update? That's not a solved problem, and naming it builds credibility with a technical audience. Leave 10 minutes for Q&A.
**Visual:** Left two-thirds: four roadmap cards in a 2x2 grid (Multi-worker, Delegation, External triggers, Governance). Right one-third: large "Q&A" text with contact/link block below it. Bottom of slide: system tagline — "OpenClaw + Sherbyte: The AI that works while you sleep." Version stamp: "RUNBOOK v2.0 · 2026-02-26."

---

*Deck version: 1.0 · Prepared for technical conference presentation · System: OpenClaw + Sherbyte + Background Worker · MANDATE v1.4*
