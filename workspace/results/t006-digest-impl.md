# Self-Improvement Task Report

Task: t006 - Implement weekly digest generator

Generated: 2026-03-04T09:47:18Z

## Steps
- 1. Create directory /home/node/workspace/task-queue/digests/ by writing /home/node/workspace/task-queue/digests/.keep with content 'weekly digests directory' — ✅ done
- 2. Read all files in /home/node/workspace/agents/worker/runs/ to gather run data — ✅ done
- 3. Generate a weekly digest at /home/node/workspace/task-queue/digests/weekly-2026-W10.md using this template: '# Worker Weekly Digest (2026-W10)\nGenerated: <ISO>\nPeriod: 2026-02-26 → 2026-03-04\n\n## Summary\n- Runs this week: <count>\n- Tasks completed: <count>\n- Tasks failed: 0\n- Escalations: 0\n\n## Standing Tasks Status\n- t001 memory-digest: operational\n- t002 vault-health: operational\n- t003 run-health: operational\n\n## Self-Improvement Tasks\n- t004 notifications: shipped\n- t005 per-attempt receipts: shipped\n- t006 weekly digest: shipping now\n\n## Notes\n<any observations from run receipts>' — ✅ done
- 4. Add a new weekly digest task to /home/node/workspace/task-queue/queue.json. Read the current queue.json and append a new task: {id: 't-weekly-digest', title: 'Weekly digest generator', priority: 'low', type: 'weekly-digest', status: 'pending', recurring: true, created: <ISO>, created_by: 'background-worker', retries: 0, max_retries: 2, run_after: null, depends_on: [], locked_at: null, owner: null, completed_at: null, error: null, input: {description: 'Read all run receipts from /home/node/workspace/agents/worker/runs/ from the past 7 days. Generate a weekly digest at /home/node/workspace/task-queue/digests/weekly-YYYY-Www.md with sections: Summary totals, failure breakdown, needs attention, completed tasks. Send digest path as a notification.'}, output_path: '/home/node/workspace/task-queue/digests/weekly-latest.md', escalate_after_ms: 7200000, tags: ['standing', 'weekly']} — ✅ done
- 5. Add weekly-digest as a task type in /home/node/workspace/agents/worker/MANDATE.md under Task Types: '### weekly-digest\nRead run receipts from the past 7 days in source_path. Generate a structured weekly digest at output_path. Write a notification summarising the digest.' — ✅ done
- 6. Append to /home/node/workspace/notifications.json: {id: 'n003', created_at: <ISO>, sent: false, sent_at: null, source: 'background-worker', task_id: 't006', message: '✅ Feature shipped: Weekly digest generator. First digest at task-queue/digests/weekly-2026-W10.md. A standing weekly task has been added to the queue.'} — ✅ done
