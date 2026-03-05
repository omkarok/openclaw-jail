# Sherbyte Intake Audit

## (a) Current intake flow — step by step
1. A user sends a task-like request (often `!task ...`) in chat.
2. Sherbyte interprets intent and constructs a queue task payload with metadata (priority, type, output path, retries, escalation windows).
3. Task objects are appended into `task-queue/queue.json` with status `pending`.
4. Worker trigger path runs background-worker to consume eligible tasks.
5. Background worker executes by mandate, writes artifacts, then emits notifications/escalations.

Evidence from config/docs indicates intent routing and heartbeat escalation monitoring are split: HEARTBEAT handles notification/escalation checks while queue execution remains in the worker lane.

## (b) Gap analysis — missing decomposition logic
- Intake currently allows oversized `self-improvement` step arrays and multi-artifact instructions to pass through unchanged.
- No explicit pre-enqueue decomposition heuristic for >1 deliverable or chained dependencies.
- No hard intake linter that rewrites vague tasks into smaller DAG units before queue write.
- Result: worker receives long tasks that should have been split into deterministic checkpoints.

## (c) Three real examples needing decomposition
1. `t-ma-video-script` — combined full script architecture, 12-scene design, and notification in one task. Better split into: outline -> script draft -> QA+notify.
2. `t-ma-screenshots` — seven sequential outputs (index + 4 assets + formatting + notify) should be decomposed into per-asset tasks with `depends_on` fan-in.
3. `t-ma-pptx` — install dependency + script generation + build + delivery should have been split into dependency-check task and build task, preventing mixed failure modes.

## (d) Proposed decomposition criteria
Sherbyte should split a request when ANY are true:
- More than one distinct deliverable file is requested.
- More than three operational steps are required.
- Work requires dependent artifacts where one output feeds another.
- Mixed toolchain requirements (e.g., install + generate + package) appear in one instruction.

Decomposition pattern:
- Create atomic tasks with one logical output each.
- Encode edges with `depends_on` and preserve end-to-end traceability via tags.
- Trigger worker once after queue write; let queue ordering and dependencies drive execution.

This approach improves retry locality, auditability, and completion reliability.
