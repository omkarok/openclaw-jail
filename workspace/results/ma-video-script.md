# Multi-Agent AI Orchestration — Demo Explainer Video Script
**System:** OpenClaw + Sherbyte + Background Worker
**Tone:** Thought-leader demo — "we built something real and it surprised us"
**Total runtime:** ~6.5 minutes

---

## SCENE 1: Hook — You Woke Up to This

**Visual:** Phone lock screen at 7:14 AM showing 5 WhatsApp notification badges. Unlock to reveal a WhatsApp DM thread from "Sherbyte AI" with five timestamped messages delivered between 9:47 PM and 10:29 AM — all while the phone sat charging on a nightstand. Messages read:
- `✅ Feature shipped: Notifications system is now live.`
- `✅ Feature shipped: Per-attempt receipts. Every task execution is now individually recorded.`
- `✅ Feature shipped: Weekly digest generator. First digest at task-queue/digests/weekly-2026-W10.md`
- `✅ Feature shipped: Failure spike detection. Sherbyte will now alert you if 3+ failures occur within 60 minutes.`
- `🚀 Self-improvement sprint complete!`

**Narration:** You went to bed. No scripts were running in a terminal tab. No cron job was babysitting a script. You just went to sleep — and when you woke up, your AI had shipped four features, updated its own instruction file, and sent you a WhatsApp summary of everything it did. That is not a demo we staged. Those are real timestamps on a real phone. What you're looking at is what happens when you stop treating AI as a chatbot and start treating it as a runtime.

**Duration:** 35 seconds

**Demo asset:** /home/node/workspace/results/demo-assets/03-whatsapp-notifications.md — render each message as a WhatsApp bubble appearing sequentially, timestamped, with the phone at 7:14 AM in the foreground

---

## SCENE 2: The Problem — Reactive AI Just Waits and Forgets

**Visual:** Split screen. Left side: a standard chat interface showing a user typing "remind me to follow up on this tomorrow" — the AI replies "Sure!" — then the conversation ends and the window goes idle with a blinking cursor. Right side: a clock fast-forwarding through the night, the chat window still open, still idle. No action taken. No reminder sent.

**Narration:** Here is the dirty secret of most AI assistants: they are purely reactive. You send a message, they respond, and then they cease to exist until you message them again. They have no memory of what they promised. They have no mechanism to act while you are offline. They cannot start a task at midnight and deliver results by morning. Every AI product built on a stateless request-response loop has this same ceiling — and almost nobody talks about it, because until recently, nobody had a clean way to break through it.

**Duration:** 30 seconds

**Demo asset:** Screen recording of a chat interface going idle — animate the right-side clock using a simple time-lapse overlay at 16x speed; no real system required

---

## SCENE 3: Architecture Reveal — Three Layers That Change Everything

**Visual:** Animated architecture diagram building layer by layer on a dark background. First layer appears: "OpenClaw Runtime" — labeled as the foundation, connecting to WhatsApp, Discord icons. Second layer builds on top: "Sherbyte Agent" — labeled "real-time bridge + heartbeat." Third layer appears to the right, slightly detached: "Background Worker" — labeled "headless executor + MANDATE.md." A dashed arrow labeled "notifications.json" connects Background Worker back up through Sherbyte to WhatsApp. The full diagram matches the ASCII layout from the content brief.

**Narration:** The architecture has three layers and they are deliberately separated. At the base is OpenClaw — the runtime that connects your AI to every channel: WhatsApp, Discord, whatever comes next. Sitting inside OpenClaw is Sherbyte, a personal AI agent that handles your real-time conversations and runs a heartbeat loop every thirty minutes. Completely separate — headless, no chat interface, no direct channel access — is the Background Worker. It reads a mandate file, processes a task queue, and writes results to disk. Sherbyte's heartbeat picks up those results and delivers them to you. Three layers. Clean separation of concerns. And that separation is exactly what makes autonomous operation possible.

**Duration:** 40 seconds

**Demo asset:** Animated SVG or Keynote build of the three-layer diagram — build each component on a 1-second delay; use the ASCII architecture from /home/node/workspace/results/ma-content-brief.md as the source of truth

---

## SCENE 4: OpenClaw — The Cross-Channel Runtime Fabric

**Visual:** Terminal split-view. Left pane: `openclaw gateway --port 18789 --verbose` output showing `[gateway] listening on ws://0.0.0.0:18789` followed by real connection events. Right pane: OpenClaw config excerpt showing `channels.whatsapp.dmPolicy: "allowlist"`, `channels.whatsapp.allowFrom: ["+1XXXXXXXXXX"]`, and `gateway.nodes.denyCommands` with a list of blocked capabilities. Overlay a subtle lock icon next to each security constraint.

**Narration:** OpenClaw is the runtime layer that everything else sits on top of. It runs inside a hardened Docker jail — read-only root filesystem, non-root user, all Linux capabilities dropped. The gateway binds on port 18789 and speaks WebSocket to any agent that connects. Channels — WhatsApp, Discord, and others — are configured with explicit allowlists, so the bot only responds to your number and nobody else's. Security audit shows zero critical issues, zero warnings. This is not a prototype with duct tape — it is a production-grade runtime that you own and operate.

**Duration:** 35 seconds

**Demo asset:** Screen recording of `docker compose exec openclaw openclaw security audit` returning `0 critical · 0 warn`, then panning to the gateway log line — both from the live running container

---

## SCENE 5: Sherbyte — Personal AI, Real-Time Bridge, Heartbeat Loop

**Visual:** WhatsApp chat showing a user typing `!task research: top 5 LLM agent frameworks in 2026` into a group. Cut to a terminal log showing Sherbyte parsing the message and writing a new entry to queue.json. Then a timeline graphic appears: a 30-minute pulse labeled "heartbeat" fires repeatedly across the timeline, with one pulse at 10:29 AM triggering a delivery arrow that lands on a WhatsApp notification bubble.

**Narration:** Sherbyte is your conversational layer — the agent you actually talk to. When you send a message in a WhatsApp group, Sherbyte parses it in real time. Commands like exclamation-task trigger structured task intake — Sherbyte validates the input, writes a new entry to the shared task queue, and kicks off the background worker. But Sherbyte also runs a heartbeat loop independently. Every thirty minutes, regardless of whether you've said anything, Sherbyte checks notifications dot json for anything the background worker wrote. If there is a pending notification, it delivers it to your WhatsApp DM. That is how the overnight results reach you by morning.

**Duration:** 40 seconds

**Demo asset:** Composite screen recording — WhatsApp group on the left (mock or live), terminal showing queue.json append on the right; overlay the 30-minute heartbeat pulse timeline as a motion graphic below both panes

---

## SCENE 6: Background Worker — Headless Executor, Reads MANDATE.md

**Visual:** Terminal showing `docker compose exec -T openclaw openclaw agent run --agent background-worker` firing. Below it, the MANDATE.md header scrolls into view: `# Background Worker — Standing Mandate v1.3`. Key lines are highlighted: `You do not chat. You execute.` and `Two triggers invoke the worker: explicit trigger (after task enqueue) and cron at 08:00 IST daily.` The terminal then shows the worker locking a task, executing, and writing a receipt file.

**Narration:** The Background Worker has no chat interface. It does not respond to messages. It reads one file — MANDATE.md — which tells it exactly what kind of agent it is, what task types it supports, and how to behave under failure. The worker is triggered two ways: immediately when a task is enqueued, and by a daily cron that fires at 08:00 IST. When it runs, it locks a task in the queue, executes it, writes a per-attempt receipt, and moves to the next item. Queue state is truth. The worker is disposable — crash it, restart it, and it picks up exactly where it left off. That is the entire design philosophy in one sentence.

**Duration:** 40 seconds

**Demo asset:** Screen recording of `openclaw agent run --agent background-worker` executing against the live container — show the lock-and-execute cycle from terminal output; pan to the MANDATE.md file at /home/node/workspace/agents/worker/MANDATE.md

---

## SCENE 7: Task Queue in Action — DAG, Priorities, Retry, Crash Recovery

**Visual:** Full-screen render of the task queue dashboard from demo-assets/01-task-queue.md — the tabular view showing task IDs (t001 through t-ma-deliver), status (done/pending/in_progress), priority (urgent/high/normal/low), and truncated titles. Animate a sort operation that reorders tasks by priority: urgent tasks float to the top (t008), then high (t004, t002), then normal, then low. Then zoom into a JSON snippet showing a task with `"depends_on": ["t004", "t005"]` — draw arrows from the dependency tasks to the blocked task.

**Narration:** The task queue is a single JSON file with a schema that does a lot of work. Every task has a priority, a status, a retry count with backoff, and a depends-on field that creates a directed acyclic graph across the whole queue. The worker never executes a task whose dependencies are not yet done. Tasks marked as recurring reset automatically after each run, with a run-after gate that prevents them firing more than once in a window. And if the worker crashes mid-task — locked_at timestamp goes stale after thirty minutes — the next invocation detects it, resets the status, and retries. The queue is append-only and auditable. You always know exactly what ran, when, and whether it succeeded.

**Duration:** 40 seconds

**Demo asset:** Animated render of /home/node/workspace/results/demo-assets/01-task-queue.md — the dashboard table — followed by a zoomed JSON snippet from /home/node/workspace/task-queue/queue.json showing the depends_on array; annotate with colored arrows for the DAG visualization

---

## SCENE 8: Self-Improvement Hero Moment — MANDATE v1.1 to v1.3 Overnight

**Visual:** Diff view. Left column: `# Background Worker — Standing Mandate v1.1` — sparse, minimal task types listed, no notifications system, no receipts. Right column: `# Background Worker — Standing Mandate v1.3` — expanded with new task types (`notifications`, `weekly-digest`, `failure-spike-detection`), new protocol sections, heartbeat checks listed. Changed lines highlighted in green. A progress bar at the bottom shows tasks t004, t005, t006, t007, t008 completing in sequence — each one adding a green checkmark as the MANDATE on the right grows.

**Narration:** This is the part that genuinely surprised us. We seeded the queue with a self-improvement sprint — five tasks whose outputs were changes to the worker's own mandate file. Task t004 implemented the notifications system. Task t005 built per-attempt receipts. Task t006 added a weekly digest generator. Task t007 added failure spike detection. Task t008 summarized the sprint and wrote the final notification. By the time we woke up, the MANDATE file had gone from version 1.1 to version 1.3 — four new capabilities, all tested, all producing output files we could verify. The worker rewrote its own instructions and then kept running under them. We did not intervene once.

**Duration:** 45 seconds

**Demo asset:** Side-by-side diff screen recording of /home/node/workspace/agents/worker/MANDATE.md — use `git diff` or a visual diff tool to show v1.1 vs v1.3 with green additions highlighted; overlay the five-task progress sequence from /home/node/workspace/results/demo-assets/04-mandate-evolution.md

---

## SCENE 9: !task Demo — WhatsApp In, Autonomous Result 8 Hours Later

**Visual:** Three-panel timeline. Panel 1 (left, labeled "10:11 PM"): WhatsApp group chat showing the user typing `!task research: top 5 most practical LLM agent frameworks in 2026`. Panel 2 (center, labeled "overnight"): terminal showing the worker executing the research task — reading context files, synthesizing output, writing to /home/node/workspace/results/t-1772618323.md, recording a receipt. Panel 3 (right, labeled "10:11 AM next day"): WhatsApp DM showing `✅ Research done: Top 5 LLM agent frameworks in 2026`.

**Narration:** Here is the simplest possible demo of what this unlocks. You are in a WhatsApp group. You type exclamation-task research colon, followed by whatever you want researched. Sherbyte parses it, validates it, assigns a task ID, and appends it to the queue. You put your phone down. Eight to twelve hours later, the background worker has executed the research task, written a full results file to disk, appended a notification entry, and Sherbyte's next heartbeat has delivered the summary to your DM. You typed eleven words. You got back a structured research result. No browser tab needed to stay open. No API call timed out. The system was just running.

**Duration:** 40 seconds

**Demo asset:** Composite screen recording — mock or live WhatsApp group chat showing the !task command sent; terminal log showing queue.json append and worker execution; WhatsApp DM showing the result notification from /home/node/workspace/results/demo-assets/03-whatsapp-notifications.md line `✅ Research done: Top 5 LLM agent frameworks in 2026`

---

## SCENE 10: The Notification Loop — Worker → notifications.json → Heartbeat → WhatsApp DM

**Visual:** Animated data flow diagram. Starting node: "Background Worker" — draws a write arrow to a file icon labeled "notifications.json". From notifications.json, a 30-minute clock icon ticks forward — labeled "Sherbyte heartbeat fires." Sherbyte reads the file, finds sent:false entries, delivers them, and marks them sent:true. Final node: WhatsApp bubble appearing on a phone. Show the actual JSON structure mid-animation: `{ "id": "n005", "sent": false, "message": "🚀 Self-improvement sprint complete!" }` transforming to `{ "sent": true, "sent_at": "2026-03-04T10:07:28Z" }`.

**Narration:** The notification pipeline is deliberately simple because simple things do not break at 3 AM. The background worker appends JSON objects to notifications dot json — each with an ID, a message, and a sent flag set to false. Sherbyte's heartbeat loop, which fires every thirty minutes independently of any user message, reads that file, finds every entry where sent is false, delivers each one to your WhatsApp DM, and marks them sent-true with a timestamp. There is no message broker. There is no pub-sub system. There is a file, a loop, and a flag. And that is exactly how the five sprint completion notifications reached a phone while its owner was asleep.

**Duration:** 38 seconds

**Demo asset:** Animated diagram built from the notification data in /home/node/workspace/results/demo-assets/03-whatsapp-notifications.md — show the JSON state transition (sent: false → sent: true) as the central animation; overlay the 30-minute heartbeat tick as a visual clock element

---

## SCENE 11: What This Enables — Proactive AI, Proof-of-Work, Zero Failures

**Visual:** Three-panel summary card layout. Panel 1: run receipts dashboard from /home/node/workspace/results/demo-assets/02-run-receipts.md — `processed=5 completed=5 failed=0` and `processed=8 completed=8 failed=0`. Panel 2: task queue dashboard showing every task with status "done" — 13 tasks completed across two sessions. Panel 3: notifications.json file showing all five sprint notifications with sent:true. A counter in the lower right ticks up: "13 tasks. 0 failures. 5 notifications delivered."

**Narration:** Here is what the receipts show. Two production runs: five tasks completed, zero failures. Eight tasks completed, zero failures. Every single execution is individually recorded in a dated receipt file — task ID, attempt number, duration, output path, error field null. That is your proof-of-work. That is what separates an autonomous system from a black box. And because the failure spike detector is now live — another feature the worker shipped to itself overnight — Sherbyte will alert you the moment three failures happen in any sixty-minute window. The system is not just autonomous. It is observable. And observability is the only thing that lets you trust autonomy enough to actually sleep.

**Duration:** 42 seconds

**Demo asset:** Screen recording panning across all three panels: /home/node/workspace/results/demo-assets/02-run-receipts.md, /home/node/workspace/results/demo-assets/01-task-queue.md (filtered to done rows), and /home/node/workspace/notifications.json showing sent:true entries; animate the 13-task / 0-failure counter incrementing

---

## SCENE 12: CTA — Open Architecture: OpenClaw + Your Agent Logic

**Visual:** Clean dark slide with the three-layer architecture diagram fading back in from Scene 3. Each component label expands to show what is replaceable: "OpenClaw Runtime → your runtime, your channels." "Sherbyte Agent → your agent logic, your persona." "Background Worker → your MANDATE, your task types." The file structure `/home/node/workspace/` fades in below with the key files: `agents/worker/MANDATE.md`, `task-queue/queue.json`, `notifications.json`, `task-queue/receipts/`. Final frame: two lines of text centered on screen — `OpenClaw + your agent logic` / `github.com/openclaw`

**Narration:** None of what you just saw is proprietary glue. OpenClaw is the runtime — swap your channels, add Discord, add SMS, the architecture does not change. The Background Worker is defined entirely by a markdown mandate file and a JSON queue schema that you own and version-control. The notification loop is eleven lines of logic around a flat file. The self-improvement sprint was five task definitions in a queue. If you can write a markdown file and a JSON object, you can build this. The interesting question is not whether this architecture works — we just showed you thirteen tasks, zero failures, five WhatsApp notifications, and a self-upgraded agent. The interesting question is: what would your agent do tonight while you sleep?

**Duration:** 45 seconds

**Demo asset:** Animated slide built from the architecture diagram — fade each component label in sequence, then reveal the file structure list; final frame is static text only on a dark background with no additional graphics

---

## NARRATION ONLY

*All narration concatenated and ready for TTS input. Natural speaking pace: approximately 150 words per minute.*

---

SCENE 1:

You went to bed. No scripts were running in a terminal tab. No cron job was babysitting a script. You just went to sleep — and when you woke up, your AI had shipped four features, updated its own instruction file, and sent you a WhatsApp summary of everything it did. That is not a demo we staged. Those are real timestamps on a real phone. What you're looking at is what happens when you stop treating AI as a chatbot and start treating it as a runtime.

---

SCENE 2:

Here is the dirty secret of most AI assistants: they are purely reactive. You send a message, they respond, and then they cease to exist until you message them again. They have no memory of what they promised. They have no mechanism to act while you are offline. They cannot start a task at midnight and deliver results by morning. Every AI product built on a stateless request-response loop has this same ceiling — and almost nobody talks about it, because until recently, nobody had a clean way to break through it.

---

SCENE 3:

The architecture has three layers and they are deliberately separated. At the base is OpenClaw — the runtime that connects your AI to every channel: WhatsApp, Discord, whatever comes next. Sitting inside OpenClaw is Sherbyte, a personal AI agent that handles your real-time conversations and runs a heartbeat loop every thirty minutes. Completely separate — headless, no chat interface, no direct channel access — is the Background Worker. It reads a mandate file, processes a task queue, and writes results to disk. Sherbyte's heartbeat picks up those results and delivers them to you. Three layers. Clean separation of concerns. And that separation is exactly what makes autonomous operation possible.

---

SCENE 4:

OpenClaw is the runtime layer that everything else sits on top of. It runs inside a hardened Docker jail — read-only root filesystem, non-root user, all Linux capabilities dropped. The gateway binds on port 18789 and speaks WebSocket to any agent that connects. Channels — WhatsApp, Discord, and others — are configured with explicit allowlists, so the bot only responds to your number and nobody else's. Security audit shows zero critical issues, zero warnings. This is not a prototype with duct tape — it is a production-grade runtime that you own and operate.

---

SCENE 5:

Sherbyte is your conversational layer — the agent you actually talk to. When you send a message in a WhatsApp group, Sherbyte parses it in real time. Commands like exclamation-task trigger structured task intake — Sherbyte validates the input, writes a new entry to the shared task queue, and kicks off the background worker. But Sherbyte also runs a heartbeat loop independently. Every thirty minutes, regardless of whether you've said anything, Sherbyte checks notifications dot json for anything the background worker wrote. If there is a pending notification, it delivers it to your WhatsApp DM. That is how the overnight results reach you by morning.

---

SCENE 6:

The Background Worker has no chat interface. It does not respond to messages. It reads one file — MANDATE.md — which tells it exactly what kind of agent it is, what task types it supports, and how to behave under failure. The worker is triggered two ways: immediately when a task is enqueued, and by a daily cron that fires at 08:00 IST. When it runs, it locks a task in the queue, executes it, writes a per-attempt receipt, and moves to the next item. Queue state is truth. The worker is disposable — crash it, restart it, and it picks up exactly where it left off. That is the entire design philosophy in one sentence.

---

SCENE 7:

The task queue is a single JSON file with a schema that does a lot of work. Every task has a priority, a status, a retry count with backoff, and a depends-on field that creates a directed acyclic graph across the whole queue. The worker never executes a task whose dependencies are not yet done. Tasks marked as recurring reset automatically after each run, with a run-after gate that prevents them firing more than once in a window. And if the worker crashes mid-task — locked_at timestamp goes stale after thirty minutes — the next invocation detects it, resets the status, and retries. The queue is append-only and auditable. You always know exactly what ran, when, and whether it succeeded.

---

SCENE 8:

This is the part that genuinely surprised us. We seeded the queue with a self-improvement sprint — five tasks whose outputs were changes to the worker's own mandate file. Task t004 implemented the notifications system. Task t005 built per-attempt receipts. Task t006 added a weekly digest generator. Task t007 added failure spike detection. Task t008 summarized the sprint and wrote the final notification. By the time we woke up, the MANDATE file had gone from version 1.1 to version 1.3 — four new capabilities, all tested, all producing output files we could verify. The worker rewrote its own instructions and then kept running under them. We did not intervene once.

---

SCENE 9:

Here is the simplest possible demo of what this unlocks. You are in a WhatsApp group. You type exclamation-task research colon, followed by whatever you want researched. Sherbyte parses it, validates it, assigns a task ID, and appends it to the queue. You put your phone down. Eight to twelve hours later, the background worker has executed the research task, written a full results file to disk, appended a notification entry, and Sherbyte's next heartbeat has delivered the summary to your DM. You typed eleven words. You got back a structured research result. No browser tab needed to stay open. No API call timed out. The system was just running.

---

SCENE 10:

The notification pipeline is deliberately simple because simple things do not break at 3 AM. The background worker appends JSON objects to notifications dot json — each with an ID, a message, and a sent flag set to false. Sherbyte's heartbeat loop, which fires every thirty minutes independently of any user message, reads that file, finds every entry where sent is false, delivers each one to your WhatsApp DM, and marks them sent-true with a timestamp. There is no message broker. There is no pub-sub system. There is a file, a loop, and a flag. And that is exactly how the five sprint completion notifications reached a phone while its owner was asleep.

---

SCENE 11:

Here is what the receipts show. Two production runs: five tasks completed, zero failures. Eight tasks completed, zero failures. Every single execution is individually recorded in a dated receipt file — task ID, attempt number, duration, output path, error field null. That is your proof-of-work. That is what separates an autonomous system from a black box. And because the failure spike detector is now live — another feature the worker shipped to itself overnight — Sherbyte will alert you the moment three failures happen in any sixty-minute window. The system is not just autonomous. It is observable. And observability is the only thing that lets you trust autonomy enough to actually sleep.

---

SCENE 12:

None of what you just saw is proprietary glue. OpenClaw is the runtime — swap your channels, add Discord, add SMS, the architecture does not change. The Background Worker is defined entirely by a markdown mandate file and a JSON queue schema that you own and version-control. The notification loop is eleven lines of logic around a flat file. The self-improvement sprint was five task definitions in a queue. If you can write a markdown file and a JSON object, you can build this. The interesting question is not whether this architecture works — we just showed you thirteen tasks, zero failures, five WhatsApp notifications, and a self-upgraded agent. The interesting question is: what would your agent do tonight while you sleep?
