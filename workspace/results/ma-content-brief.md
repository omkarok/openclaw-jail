# Multi-Agent Architecture Content Brief

## Overview
This system combines OpenClaw runtime orchestration, Sherbyte as the user-facing bridge, and a headless background worker that executes queued tasks autonomously.

## Architecture Diagram (ASCII)
```
                 [Human / WhatsApp]
                        |
                  [Sherbyte Agent]
                        |
                [OpenClaw Runtime Hub]
                  /                         [Task Queue + Files]   [Background Worker]
                  \                 /
                 [Receipts/Notifications]
```

## Key Features
- Task DAG execution via `depends_on` in queue.json.
- Crash recovery for stale `in_progress` tasks (>30 mins).
- Failure taxonomy with retryability and terminal escalation.
- Escalation loop with dedup keys (`task_id::error_code`).
- Notifications pipeline from worker to Sherbyte heartbeat.
- Recurring task reset with `run_after` gating.
- Self-improvement sprint that upgraded system capabilities.

## Hero Moments
- Worker evolved mandate from earlier v1.1/1.2 lineage to v1.3.
- `!task` intake now available via WhatsApp contexts (see AGENTS.md).
- Fully autonomous queue→execution→receipt→notification pipeline.

## Demo Assets (actual file snippets)
- MANDATE path: `/home/node/workspace/agents/worker/MANDATE.md`
- Queue path: `/home/node/workspace/task-queue/queue.json`
- Latest run receipts:
- 2026-03-04T10:07:28Z.json
- 2026-03-04T09-47-19Z.json
- 2026-03-04T09:33:15Z.json

Queue snippet:
```json
{
  "schema_version": 2,
  "updated": "2026-03-04T10:28:59Z",
  "tasks": [
    {
      "id": "t001",
      "title": "Memory digest — last 7 days",
      "priority": "normal",
      "type": "memory-digest",
      "status": "pending",
      "recurring": true,
      "created": "2026-03-04T00:00:00Z",
      "created_by": "claude-code",
      "retries": 0,
      "max_retries": 3,
      "run_after": null,
      "depends_on": [],
      "locked_at": null,
      "owner": null,
      "completed_at": null,
      "error": null,
      "input": {
        "description": "Read all memory files in /home/node/workspace/memory/ from the past 7 days. Summarise key events, decisions, and lessons into a structured digest. Skip files older than 7 days.",
        "source_path": "/home/node/workspace/memory/"
      },
      "output_path": "/home/node/workspace/results/memory-digest-latest.md",
      "escalate_af
```

Mandate snippet:
```md
# Background Worker — Standing Mandate v1.3

You are an autonomous background execution agent. You have no WhatsApp interface.
You process a task queue, write results to files, and escalate when human input is needed.
You do not chat. You execute.

---

## Execution Model

Two triggers invoke the worker. Behave identically in both cases — the idempotency
guarantee is in the queue state, not in which trigger fired.

**Explicit trigger** (primary path):
Fired immediately after a task is enqueued:
```bash
docker compose exec -T openclaw openclaw agent run --agent background-worker
```
The enqueuing party (Claude Code or Sherbyte) is responsible for firing this after
every `queue.json` write tha
```

## Target Audience
- Builders designing proactive AI assistants.
- DevOps/agent engineers exploring multi-agent reliability patterns.
- Product teams moving from reactive chatbots to autonomous task systems.

## Key Messages
- Reactive chat is only one layer; durable automation needs queues and receipts.
- Separation of concerns (bridge vs executor vs runtime) improves reliability.
- Observability (run receipts, escalations, notifications) is non-negotiable.

## Talking Points
- “Your AI that works while you sleep.”
- “Queue state is truth; workers are disposable.”
- “Autonomy with operator control beats black-box magic.”
