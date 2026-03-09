# Secure Context Sync Policy v1

Last updated: 2026-03-07 (UTC)
Owner: OK
Applies to: Sherbyte/OpenClaw workspace context sync

## 1) Goal
Keep context unified enough for high-quality assistance without creating unnecessary security/privacy risk.

## 2) Design Principles
1. Selective sync, not full mirror.
2. Least privilege by default.
3. Sensitive data requires explicit approval.
4. Every synced item must have provenance (source + timestamp).
5. Time-bound retention for low-value context.
6. Reversible operations only unless OK explicitly approves otherwise.

## 3) Memory Tiers

### Tier 1 — Low sensitivity (auto-allowed)
Examples:
- Working style preferences
- Communication/tone preferences
- Reusable workflows and templates
- Non-sensitive productivity habits

Storage:
- USER.md (concise profile)
- memory/YYYY-MM-DD.md (operational notes)

Retention:
- Keep until stale; review monthly.

### Tier 2 — Operational context (allowed with structure)
Examples:
- Project decisions
- Active goals/todos
- Architecture decisions and tradeoffs
- KPI definitions / reporting schema

Storage:
- MEMORY.md (curated long-term; when present)
- dedicated project files under /home/node/workspace

Retention:
- 90 days default, then archive/summarize.

### Tier 3 — Sensitive/private (explicit approval required)
Examples:
- Personal identifiers, legal/financial data
- Credentials/secrets/tokens
- Private relationship/health details
- Third-party confidential data

Policy:
- Do NOT sync by default.
- Only sync if OK explicitly says so for that item.
- Redact whenever possible.
- Never store raw secrets in memory files.

## 4) Sync Allowlist (what WILL be synced)
- Decisions that affect future execution
- Stable preferences that reduce repeated clarifications
- Active open loops/tasks requiring follow-up
- Definitions used for recurring reports (metrics, formulae)

## 5) Sync Denylist (what will NOT be synced)
- Full raw chat transcripts by default
- Credentials/API keys/tokens/session files
- Anything user marks as off-limits/private
- Large low-signal chatter with no operational value

## 6) Sync Cadence
- Weekly structured sync (default)
- Event-based sync for major decisions only
- No background bulk import without explicit OK approval

## 7) Data Quality Rules
Each synced entry must include:
- `when` (ISO timestamp)
- `source` (chat/file/manual)
- `summary` (1-3 lines)
- `action_impact` (why it matters)

If confidence is low, mark `confidence: low` and avoid hard assertions.

## 8) Change Control & Safety
Safe without confirmation:
- Add/update policy and templates
- Add non-sensitive structured summaries
- Correct stale/duplicate low-sensitivity notes

Requires explicit OK confirmation first:
- Any Tier 3 write
- Any deletion of historical notes
- Any cross-system export/import automation
- Any irreversible migration

## 9) Security Controls
- Never store secrets in sync artifacts.
- Prefer summaries over raw dumps.
- Minimize blast radius by separating files per topic.
- Keep sensitive context out of group-facing flows.

## 10) Auditability
For each sync event, log in `memory/YYYY-MM-DD.md`:
- what was synced
- file(s) touched
- sensitivity tier
- whether approval was needed/provided

## 11) Rollback
If a sync is judged wrong:
1. Stop further sync writes.
2. Revert edited file(s) from git/history if available.
3. Add a correction note with timestamp and reason.
4. Resume only after OK confirms.

## 12) Operating Mode (current)
- Mode: conservative
- Tier 1 + Tier 2 sync: enabled
- Tier 3 sync: disabled unless explicitly approved by OK
