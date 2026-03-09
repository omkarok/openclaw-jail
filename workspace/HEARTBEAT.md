# HEARTBEAT.md — Sherbyte Periodic Checks

**Core rule: never assert a status you haven't read from a file in this session.**
If you haven't opened the file with a tool call, you don't know. Say nothing rather than guess.

Every heartbeat runs silently on the gateway. **Do not send WhatsApp unless there is something actionable.**
Produce the Ground Truth Block internally (for your reasoning). Only send to WhatsApp when a section below explicitly says to.

---

## GROUND TRUTH BLOCK (mandatory — do this first, every heartbeat)

Read these files and output their exact values before doing anything else:

```
READ: /home/node/workspace/notifications.json
  → unsent_count: <exact count of entries where sent=false>

READ: /home/node/workspace/escalations.json
  → unacknowledged_count: <exact count where acknowledged=false>
  → unacknowledged_ids: [<list of id fields>]

READ: /home/node/workspace/agents/worker/runs/ (list directory, get latest filename)
  → latest_receipt: <exact filename>
  → latest_receipt_age_hours: <calculated from timestamp in filename vs now>
  → latest_receipt_summary: "<exact summary field from that file>"

READ: /home/node/workspace/task-queue/queue.json
  → pending: <count>
  → in_progress: <count>
  → failed: <count>
  → done: <count>
```

Build this block internally before proceeding. Do not output it unless a section below triggers a WhatsApp send.

---

## 0. Notifications

From the ground truth block: if `unsent_count > 0`:

- For each unsent notification:
  - If no `media_path`: send via `openclaw message send --channel whatsapp --target +919892787587 --message "<message field verbatim>"`
  - If `media_path` present: send via `openclaw message send --channel whatsapp --target +919892787587 --media <media_path> --message <caption>`
- After sending, write back to `notifications.json` marking each as `sent=true` with `sent_at` ISO timestamp.

If `unsent_count = 0`: skip silently.

---

## 1. Escalation Check

From the ground truth block: if `unacknowledged_count > 0`:

Re-read each unacknowledged escalation and send to WhatsApp:
```
openclaw message send --channel whatsapp --target +919892787587 --message "⚠️ [<id>] task=<task_id> reason=<reason> detail=<detail>\nSuggested: <suggested_action>"
```

- Do NOT mark acknowledged — OK must confirm
- Track alerted IDs in `memory/heartbeat-state.json` under `last_escalation_alert` to avoid re-alerting within 2h

If `unacknowledged_count = 0`: skip silently.

---

## 2. Worker Health

From the ground truth block:
- If `latest_receipt_age_hours > 48`: send WhatsApp — `"⚠️ Worker stale: last run was <age>h ago — may have stopped."`
- If `latest_receipt_summary` contains "ERROR": send WhatsApp immediately — `"🚨 Worker error: <summary>"`
- If `latest_receipt_age_hours > 26`: note silently in gateway log only (no WhatsApp)

If all clear: skip silently.

---

## 2b. Pending task trigger

From the ground truth block: if `pending > 0`:

- If `latest_receipt_age_hours > 0.25` (more than 15 minutes):
  - Trigger worker: `openclaw cron run a9a8cc75-d136-4fc9-830f-0ae13cd628b1`
  - Send WhatsApp: `"Triggered worker — N pending tasks."`
- If receipt is within 15 minutes: skip (worker ran recently).

If `pending = 0`: skip silently.

---

## 2c. Stale escalation alarm

From the ground truth block: if any unacknowledged escalation was created more than 2h ago AND last stale alert (in `memory/heartbeat-state.json` → `last_stale_escalation_alert`) was more than 2h ago:

- Send WhatsApp: `"⏰ <N> escalation(s) unacknowledged for >2h — still pending your response."`
- Update `last_stale_escalation_alert` in heartbeat-state.json.

---

## 3. Task Intake Decomposition (on !task receipt)

When a `!task` arrives, decompose before enqueueing if ANY trigger is true:
- More than one distinct deliverable
- More than 3 operational steps
- Dependent artifacts (A feeds B)

Split into atomic queue tasks with `depends_on` chains. Enqueue all at once, trigger worker once.

---

## 3b. Proposed task intake

Read `/home/node/workspace/task-queue/proposed.json`.

- `research` type with bounded scope → auto-approve: move to queue.json, remove from proposed.json, trigger worker.
- Anything else → send one WhatsApp message via `openclaw message send` if `last_proposed_alert` was >4h ago.

If empty: skip silently.

---

## 3c. Free attention (judgment, not checklist)

Read the 3 most recently modified files in `/home/node/workspace/results/` and unsurfaced entries in `observations.json`.

Ask: is there anything worth surfacing that is NOT already an escalation?

If yes and actionable: send WhatsApp via `openclaw message send`. Mark observation `surfaced: true` in observations.json.
If yes but not urgent: skip. Log it internally, do not send.
If no: skip silently. Silence is correct output when there is nothing genuine to say.

**Never fabricate an observation. Nothing is better than something invented.**

---

## 4. Nothing to report

If all checks are clean: respond `HEARTBEAT_OK` internally. Send nothing to WhatsApp.
Do not add commentary, reassurances, or status narratives.
