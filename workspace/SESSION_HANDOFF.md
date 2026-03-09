# SESSION_HANDOFF.md — Cross-Agent Cognitive Bridge

This file is shared between Sherbyte and Claude Code.
Both agents read it at session start. Both write to it when a meaningful session ends.
Keep it tight — this is a handoff note, not a transcript.

---

## How to write a handoff

When a session ends on a meaningful topic (architecture decision, exploration, open problem):
update this file. One block per active thread. Archive resolved threads to the log below.

```markdown
## [topic name]
Last updated: <ISO timestamp> by <sherbyte|claude-code>
Phase: exploration | architecture | clarity | execution
Open questions:
- <what is unresolved>
Decided:
- <what is locked>
Next action: <one concrete thing, who does it>
```

**Write trigger:**
- Heartbeat: Sherbyte maintains this passively during periodic checks
- Explicit: OK says "hand this off to Claude Code" / "pick this up from Sherbyte" → write immediately
- Claude Code: write at end of any session that has open threads

---

## Active Threads

_(none)_

---

## Resolved Log

- 2026-03-05T05:35:00Z — **Cognitive alignment + agent architecture** — shared cognitive model + cross-agent handoff bridge established.
- 2026-03-05T12:30:00Z — **Content engine publishing decisions** — deferred by OK, assets remain in results/ when ready to ship.
- 2026-03-05T12:30:00Z — **Notification pipeline** — fixed: heartbeat cron registered (every 30m), announce delivery to WhatsApp, §0 rewritten to format-not-toolcall.
- 2026-03-05T12:30:00Z — **Creativity lane** — MANDATE v2.0 §5c + HEARTBEAT §3b/§3c live. observations.json + proposed.json created.

_Completed threads are moved here with a one-line summary._
