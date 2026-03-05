# Sherbyte Intake Decomposition Proposal

This proposal adds a dedicated intake decomposition section to `HEARTBEAT.md.proposed` so oversized user requests are normalized into queue-native DAG tasks before execution.

## Highlights
- Defines hard split triggers (>1 deliverable, >3 steps, dependent artifacts).
- Defines split mechanics (atomic tasks + depends_on chain + single worker trigger).
- Includes a concrete mapping example from a vague omnibus request to five deterministic tasks.

## Expected impact
- Fewer bloated self-improvement tasks entering worker execution.
- Better retry locality and reduced partial-failure blast radius.
- Cleaner receipts and simpler operational debugging.

Review `HEARTBEAT.md.proposed` for insertion details.
