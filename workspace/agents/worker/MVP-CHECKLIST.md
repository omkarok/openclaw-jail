# Background Worker MVP — Execution Checklist

**Purpose:** Build-reference checklist. Live status as of 2026-03-04.
**Legend:** ✅ live | 🔜 planned | ❌ not doing (scope)

---

## 0) Implementation guardrails

- ✅ Single source of truth: `workspace/task-queue/queue.json`
- ✅ Single worker process (MVP assumption)
- ✅ All transitions auditable (run receipt per run)
- ✅ UTC timestamps only (ISO-8601, Z suffix)
- 🔜 Atomic queue writes (tmp+rename) — LLM can't do OS-level atomic; mitigated by crash recovery
- 🔜 Strict JSON schema validation before mutations — deferred; LLM validates implicitly

---

## 1) Queue schema + lock contract

### 1.1 File layout
- ✅ `workspace/task-queue/queue.json`
- ✅ `workspace/agents/worker/runs/` (receipts per run)
- ✅ `workspace/results/` (task output)
- ✅ `workspace/escalations.json`
- 🔜 `workspace/task-queue/receipts/YYYY-MM-DD/` (per-attempt receipts — v2)
- 🔜 `workspace/task-queue/digests/` (weekly digest — v2)
- 🔜 `workspace/task-queue/archive/` (done-task compaction — deferred)

### 1.2 Queue JSON schema
- ✅ `schema_version`, `updated`, `tasks[]`
- ✅ Per-task: `id`, `title`, `priority` (urgent/high/normal/low), `type`, `status`
- ✅ `recurring`, `created`, `created_by`, `retries`, `max_retries`
- ✅ `run_after` (backoff), `depends_on`, `locked_at`, `owner`, `completed_at`
- ✅ `error` object, `input`, `output_path`, `escalate_after_ms`, `tags`
- ✅ Status enum: `pending | in_progress | done | failed | blocked`
- ✅ Priority enum: `urgent | high | normal | low`
- ✅ `depends_on` semantics: task runnable only if all deps are `done`; blocked if dep `failed`
- ✅ Deterministic selection: priority → run_after → created

### 1.3 Lock contract
- ✅ Lock via `locked_at` + `owner` fields
- ✅ Stale reset: >30min in-progress → reset to pending (or failed if max_retries hit)
- 🔜 Lease renewal mid-run — not feasible for LLM agent; 30min stale window is the mitigation
- 🔜 `locks/worker.lock` heartbeat file — deferred

### 1.4 Queue mutation contract
- ✅ Every write updates root `updated`
- ✅ `recurring: true` tasks reset done → pending on each run (Step 0)
- ✅ Failed tasks never deleted in MVP
- 🔜 Done-task archive after receipt write — deferred

---

## 2) Worker mandate + failure taxonomy

### 2.1 Mandate
- ✅ MANDATE.md v1.1 live at `workspace/agents/worker/MANDATE.md`
- ✅ Step 0: recurring task reset
- ✅ Step 1: crash recovery
- ✅ Step 2: blocked status propagation
- ✅ Step 3: task execution loop with priority ordering
- ✅ Step 4: escalation with dedup
- ✅ Step 5: run receipt
- ✅ Cron reads MANDATE.md directly (not inlined) — updates propagate automatically

### 2.2 Failure taxonomy
- ✅ Error codes: `VALIDATION_ERROR | EXECUTION_ERROR | TIMEOUT | PERMISSION_DENIED | DEPENDENCY_FAILED | MAX_RETRIES_EXCEEDED | INTERNAL_ERROR`
- ✅ Retry/non-retry classification per code
- ✅ Exponential backoff via `run_after`: `now + min(2^retries * 60s, 3600s)`
- ✅ Structured error object: `{code, message, retryable}`

---

## 3) Receipt schema + weekly digest

### 3.1 Run receipt (per-run)
- ✅ Path: `workspace/agents/worker/runs/<ISO-timestamp>.json`
- ✅ Fields: timestamp, mandate_version, tasks_found, tasks_reset_recurring, tasks_reset_from_crash, tasks_blocked, tasks_processed, tasks_completed, tasks_failed, tasks_skipped_run_after, escalations_raised, escalations_deduped, summary
- 🔜 Per-attempt receipts (`receipts/YYYY-MM-DD/<task_id>__attempt-<n>__.json`) — v2

### 3.2 Weekly digest
- 🔜 Sunday cron, reads run receipts, writes `digests/weekly-YYYY-Www.md`
- 🔜 Sections: Summary totals, failure breakdown, needs attention, completed high-priority

---

## 4) Sherbyte escalation rules + heartbeat

### 4.1 Escalation contract
- ✅ Escalation schema v2: id, created_at, acknowledged, acknowledged_at, source, task_id, title, reason, detail, suggested_action, dedup_key
- ✅ Dedup: worker checks dedup_key before appending (no duplicate alerts for same task+error)
- ✅ Worker never messages OK directly — escalations.json only

### 4.2 Heartbeat integration
- ✅ HEARTBEAT.md updated: checks escalations.json every heartbeat
- ✅ Consolidated alert: ONE WhatsApp message for all unacknowledged escalations
- ✅ Dedup: tracks last_escalation_alert in `memory/heartbeat-state.json`, suppresses re-alerts within 2h
- ✅ Worker health check every ~2h (every 4th heartbeat)
- 🔜 Failure spike detection (3+ failures in 60min) — v2

---

## 5) Definition of Done (MVP acceptance)

- ✅ Worker picks, locks, executes, and finalises tasks end-to-end
- ✅ Stale in-progress tasks auto-reset
- ✅ Recurring tasks reset done → pending each run
- ✅ Blocked status propagates when dependency fails
- ✅ Every run produces a receipt
- ✅ Escalation dedup prevents alert spam
- ✅ Sherbyte sends consolidated alert (not per-escalation pings)
- ✅ Test run: 3/3 tasks completed, 0 escalations, receipt written
- 🔜 Weekly digest generator
- 🔜 Per-attempt receipts

---

## 6) Build order — actual sequence (for reference)

1. ✅ queue.json schema + worker mandate MANDATE.md v1.0
2. ✅ Register background-worker agent + daily cron
3. ✅ escalations.json + HEARTBEAT.md escalation check
4. ✅ Test run: 3 seed tasks end-to-end
5. ✅ Schema v2: priority enum, recurring, blocked, error object, run_after, dedup
6. ✅ MANDATE.md v1.1: failure taxonomy, step 0 recurring reset, blocked propagation, dedup
7. ✅ HEARTBEAT.md: consolidated alert, dedup with heartbeat-state.json
8. ✅ Cron: references MANDATE.md file (not inlined)
9. 🔜 Per-attempt receipts
10. 🔜 Weekly digest cron

