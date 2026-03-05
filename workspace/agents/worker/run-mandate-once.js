const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const queuePath = '/home/node/workspace/task-queue/queue.json';
const notificationsPath = '/home/node/workspace/notifications.json';
const escalationsPath = '/home/node/workspace/escalations.json';
const runsDir = '/home/node/workspace/agents/worker/runs';
const statusPath = '/home/node/workspace/WORKER_STATUS.md';
const receiptsBase = '/home/node/workspace/task-queue/receipts';

const runStarted = new Date();
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const parse = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const ensureDir = (d) => fs.mkdirSync(d, { recursive: true });

const stats = {
  timestamp: nowIso(),
  mandate_version: '1.9',
  tasks_found: 0,
  tasks_reset_recurring: 0,
  tasks_reset_from_crash: 0,
  tasks_blocked: 0,
  tasks_processed: 0,
  tasks_completed: 0,
  tasks_failed: 0,
  tasks_skipped_run_after: 0,
  escalations_raised: 0,
  escalations_deduped: 0,
  summary: ''
};

function validateQueue() {
  execSync('node /home/node/workspace/tools/validate-queue.js', { stdio: 'pipe' });
}

function saveQueue(queue) {
  queue.updated = nowIso();
  if (queue.schema_version !== 2 || !Array.isArray(queue.tasks)) throw new Error('Invalid queue shape');
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
  validateQueue();
}

function appendNotification(obj) {
  const n = parse(notificationsPath);
  n.notifications.push(obj);
  fs.writeFileSync(notificationsPath, JSON.stringify(n, null, 2));
}

function ensureEscalations() {
  if (!fs.existsSync(escalationsPath)) {
    fs.writeFileSync(escalationsPath, JSON.stringify({ schema_version: 1, escalations: [] }, null, 2));
  }
}

function escalate(task, error, suggestedAction) {
  ensureEscalations();
  const e = parse(escalationsPath);
  const dedup_key = `${task.id}::${error.code}`;
  const exists = e.escalations.find(x => x.dedup_key === dedup_key && x.acknowledged === false);
  if (!exists) {
    e.escalations.push({
      id: `esc-${task.id}-${Date.now()}`,
      created_at: nowIso(),
      acknowledged: false,
      acknowledged_at: null,
      source: 'background-worker',
      task_id: task.id,
      title: task.title,
      reason: error.code,
      detail: error.message,
      suggested_action: suggestedAction,
      dedup_key
    });
    fs.writeFileSync(escalationsPath, JSON.stringify(e, null, 2));
    stats.escalations_raised++;
  } else {
    stats.escalations_deduped++;
  }

  appendNotification({
    id: `notif-${task.id}-failed-${Date.now()}`,
    created_at: nowIso(),
    sent: false,
    sent_at: null,
    source: 'background-worker',
    task_id: task.id,
    message: `❌ Task failed: ${task.title}\nReason: ${error.code} — ${error.message}\nAttempts: ${task.retries}/${task.max_retries}\nAction needed: ${suggestedAction}`
  });
}

function perAttemptReceipt(task, attempt, status, startedAt, outputSummary, error, statusBefore, statusAfter) {
  const t = new Date();
  const day = t.toISOString().slice(0, 10);
  const ts = nowIso();
  const dir = path.join(receiptsBase, day);
  ensureDir(dir);
  const file = path.join(dir, `${task.id}__attempt-${attempt}__${ts}.json`);
  const receipt = {
    receipt_version: 1,
    timestamp: ts,
    worker_id: 'background-worker',
    task_id: task.id,
    attempt,
    status,
    started_at: startedAt,
    finished_at: ts,
    duration_ms: new Date(ts).getTime() - new Date(startedAt).getTime(),
    output: { summary: outputSummary },
    error: error || null,
    queue_snapshot: { status_before: statusBefore, status_after: statusAfter }
  };
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2));
}

function executeTask(task) {
  if (task.type === 'video') {
    const scriptPath = task.input?.script_path;
    const out = task.input?.output_path || task.output_path;
    if (!scriptPath || !out) throw { code: 'VALIDATION_ERROR', message: 'Missing script_path/output_path', retryable: false };
    execSync(`node /home/node/workspace/agents/worker/generate-video.js '${scriptPath}' '${out}'`, { stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 });
    const st = fs.statSync(out);
    if (st.size < 100 * 1024) throw { code: 'QUALITY_FAILURE', message: `Video too small (${st.size} bytes)`, retryable: true };
    return `Video rendered (${st.size} bytes)`;
  }
  throw { code: 'VALIDATION_ERROR', message: `Unsupported task type: ${task.type}`, retryable: false };
}

try {
  validateQueue();
} catch (e) {
  const receipt = { ...stats, summary: 'ERROR: queue.json failed validation' };
  ensureDir(runsDir);
  fs.writeFileSync(path.join(runsDir, `${nowIso()}.json`), JSON.stringify(receipt, null, 2));
  process.exit(0);
}

let queue = parse(queuePath);
const now = Date.now();

// Step 0 recurring reset
for (const t of queue.tasks) {
  if (t.recurring === true && t.status === 'done' && t.run_after && new Date(t.run_after).getTime() <= now) {
    t.status = 'pending'; t.completed_at = null; t.error = null;
    stats.tasks_reset_recurring++;
  }
}
saveQueue(queue);

// Step 1 crash recovery + timeout enforcement
for (const t of queue.tasks) {
  if (t.status === 'in_progress' && t.locked_at && (now - new Date(t.locked_at).getTime() > 30 * 60 * 1000)) {
    if ((t.retries || 0) < (t.max_retries || 0)) {
      t.status = 'pending'; t.locked_at = null; t.owner = null; stats.tasks_reset_from_crash++;
    } else {
      t.status = 'failed';
      t.error = { code: 'TIMEOUT', message: 'stale lock exceeded 30 minutes', retryable: false };
      escalate(t, t.error, 'Inspect stuck execution and requeue if safe.');
      stats.tasks_failed++;
    }
  }

  const escal = t.escalate_after_ms ?? 0;
  if (t.status === 'pending' && t.locked_at == null && (t.retries || 0) === 0 && escal > 0) {
    if (new Date(t.created).getTime() + escal < now) {
      t.status = 'failed';
      t.error = { code: 'TIMEOUT', message: 'pending longer than escalate_after_ms', retryable: true };
      escalate(t, t.error, 'Inspect task input/output and retry or fix dependencies.');
      stats.tasks_failed++;
    }
  }
}
saveQueue(queue);

// Step 2 block cascade
let changed = true;
while (changed) {
  changed = false;
  const map = new Map(queue.tasks.map(t => [t.id, t]));
  for (const t of queue.tasks) {
    if (t.status === 'pending' || t.status === 'blocked') {
      const deps = t.depends_on || [];
      const bad = deps.some(d => {
        const dt = map.get(d);
        return dt && (dt.status === 'failed' || dt.status === 'blocked');
      });
      if (bad && t.status !== 'blocked') {
        t.status = 'blocked';
        stats.tasks_blocked++;
        changed = true;
      }
    }
  }
}
saveQueue(queue);

// Step 3 process tasks one by one
function priorityRank(p) { return ({ urgent: 0, high: 1, normal: 2, low: 3 }[p] ?? 9); }

while (true) {
  queue = parse(queuePath);
  const map = new Map(queue.tasks.map(t => [t.id, t]));
  const ready = queue.tasks.filter(t => {
    if (t.status !== 'pending') return false;
    if (t.run_after && new Date(t.run_after).getTime() > Date.now()) return false;
    const deps = t.depends_on || [];
    return deps.every(d => map.get(d)?.status === 'done');
  }).sort((a,b) => priorityRank(a.priority)-priorityRank(b.priority) || new Date(a.created)-new Date(b.created));

  if (!ready.length) break;
  const task = ready[0];
  stats.tasks_found++;
  const statusBefore = task.status;
  const startedAt = nowIso();

  task.status = 'in_progress'; task.locked_at = startedAt; task.owner = 'background-worker';
  saveQueue(queue);

  // concurrent guard
  queue = parse(queuePath);
  const live = queue.tasks.find(t => t.id === task.id);
  if (!(live && live.status === 'in_progress' && live.owner === 'background-worker')) continue;

  stats.tasks_processed++;
  try {
    const summary = executeTask(live);
    // quality gate generic
    const outPath = live.output_path;
    if (!fs.existsSync(outPath)) throw { code: 'QUALITY_FAILURE', message: 'Output file missing', retryable: true };
    const st = fs.statSync(outPath);
    if (st.size < 10 * 1024) throw { code: 'QUALITY_FAILURE', message: `Output too small (${st.size} bytes)`, retryable: true };

    queue = parse(queuePath);
    const t = queue.tasks.find(x => x.id === live.id);
    t.status = 'done';
    t.completed_at = nowIso();
    t.locked_at = null; t.owner = null; t.error = null;
    if (t.recurring) {
      const interval = (t.interval_hours ?? 24) * 3600 * 1000;
      t.run_after = new Date(new Date(t.completed_at).getTime() + interval).toISOString().replace(/\.\d{3}Z$/, 'Z');
    }
    saveQueue(queue);

    appendNotification({
      id: `n-${Date.now()}`,
      created_at: nowIso(),
      sent: false,
      sent_at: null,
      source: 'background-worker',
      task_id: t.id,
      message: `✅ Task done: ${t.title}\nResult: ${t.output_path}`
    });

    perAttemptReceipt(t, (t.retries || 0) + 1, 'done', startedAt, summary, null, statusBefore, 'done');
    stats.tasks_completed++;
  } catch (err) {
    const e = err.code ? err : { code: 'EXECUTION_ERROR', message: String(err.message || err), retryable: true };
    queue = parse(queuePath);
    const t = queue.tasks.find(x => x.id === live.id);
    t.retries = (t.retries || 0) + 1;
    t.error = { code: e.code, message: e.message, retryable: !!e.retryable };
    let finalStatus = 'pending';
    if (e.retryable && t.retries < t.max_retries) {
      const backoff = Math.min(Math.pow(2, t.retries) * 60, 3600) * 1000;
      t.status = 'pending';
      t.run_after = new Date(Date.now() + backoff).toISOString().replace(/\.\d{3}Z$/, 'Z');
      t.locked_at = null; t.owner = null;
    } else {
      t.status = 'failed';
      t.locked_at = null; t.owner = null;
      escalate(t, t.error, 'Inspect task input/output and retry or fix dependencies.');
      stats.tasks_failed++;
      finalStatus = 'failed';
    }
    saveQueue(queue);
    perAttemptReceipt(t, t.retries, finalStatus, startedAt, 'failed', t.error, statusBefore, finalStatus);
  }
}

queue = parse(queuePath);
const failedTasks = queue.tasks.filter(t => t.status === 'failed');
const lastFailed = failedTasks[failedTasks.length - 1];
const completedTasks = queue.tasks.filter(t => t.status === 'done' && t.completed_at).sort((a,b)=>new Date(a.completed_at)-new Date(b.completed_at));
const lastCompleted = completedTasks[completedTasks.length - 1];

stats.summary = stats.tasks_processed ? `Processed ${stats.tasks_processed} task(s): ${stats.tasks_completed} completed, ${stats.tasks_failed} failed.` : 'No runnable pending tasks.';

ensureDir(runsDir);
fs.writeFileSync(path.join(runsDir, `${nowIso()}.json`), JSON.stringify(stats, null, 2));

const pendingN = queue.tasks.filter(t => t.status === 'pending').length;
const inProgN = queue.tasks.filter(t => t.status === 'in_progress').length;
const blockedN = queue.tasks.filter(t => t.status === 'blocked').length;
const failedN = queue.tasks.filter(t => t.status === 'failed').length;

const statusMd = `# Worker Status\nLast run: ${nowIso()}\nMandate: v1.9\nTasks pending: ${pendingN} | in_progress: ${inProgN} | blocked: ${blockedN} | failed: ${failedN}\nLast failure: ${lastFailed ? `${lastFailed.id} (${lastFailed.error?.code || 'unknown'})` : 'none'}\nLast completed: ${lastCompleted ? `${lastCompleted.id} (${lastCompleted.title})` : 'none'}\n`;
fs.writeFileSync(statusPath, statusMd);

console.log(stats.summary);
