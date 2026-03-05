#!/usr/bin/env node
// validate-queue.js — hard schema enforcement for queue.json
// Exit 0 = valid. Exit 1 = errors found (prints details).
// Run after every queue.json write. This is programmatic enforcement —
// the LLM is NOT the validator here.

const fs = require('fs');
const QUEUE_PATH = '/home/node/workspace/task-queue/queue.json';

const REQUIRED_TASK_FIELDS = ['id', 'title', 'type', 'status', 'priority', 'created', 'retries', 'max_retries', 'depends_on'];
const VALID_STATUSES = ['pending', 'in_progress', 'done', 'failed', 'blocked'];
const VALID_PRIORITIES = ['urgent', 'high', 'normal', 'low'];

function validate() {
  const errors = [];

  // 1. Parse
  let raw;
  try {
    raw = fs.readFileSync(QUEUE_PATH, 'utf8');
  } catch (e) {
    console.error(`FATAL: cannot read queue.json — ${e.message}`);
    process.exit(1);
  }

  let queue;
  try {
    queue = JSON.parse(raw);
  } catch (e) {
    console.error(`FATAL: queue.json is not valid JSON — ${e.message}`);
    process.exit(1);
  }

  // 2. Top-level schema
  if (queue.schema_version !== 2) errors.push(`schema_version must be 2, got ${queue.schema_version}`);
  if (!Array.isArray(queue.tasks)) { console.error('FATAL: tasks is not an array'); process.exit(1); }

  // 3. Per-task checks
  const ids = new Set();
  queue.tasks.forEach((task, i) => {
    const pfx = `task[${i}] (id=${task.id})`;

    // Required fields
    REQUIRED_TASK_FIELDS.forEach(f => {
      if (task[f] === undefined) errors.push(`${pfx}: missing required field "${f}"`);
    });

    // Duplicate IDs
    if (task.id) {
      if (ids.has(task.id)) errors.push(`${pfx}: duplicate id "${task.id}"`);
      ids.add(task.id);
    }

    // Valid enum values
    if (task.status && !VALID_STATUSES.includes(task.status))
      errors.push(`${pfx}: invalid status "${task.status}"`);
    if (task.priority && !VALID_PRIORITIES.includes(task.priority))
      errors.push(`${pfx}: invalid priority "${task.priority}"`);

    // depends_on references exist (deferred until all IDs collected)
  });

  // 4. depends_on reference check
  queue.tasks.forEach((task, i) => {
    if (!Array.isArray(task.depends_on)) return;
    task.depends_on.forEach(dep => {
      if (!ids.has(dep))
        errors.push(`task[${i}] (id=${task.id}): depends_on references unknown id "${dep}"`);
    });
  });

  // 5. Cycle detection (DFS)
  const adjList = {};
  queue.tasks.forEach(t => { adjList[t.id] = t.depends_on || []; });

  function hasCycle(node, visited, stack) {
    visited.add(node);
    stack.add(node);
    for (const neighbour of (adjList[node] || [])) {
      if (!visited.has(neighbour)) {
        if (hasCycle(neighbour, visited, stack)) return true;
      } else if (stack.has(neighbour)) {
        return true;
      }
    }
    stack.delete(node);
    return false;
  }

  const visited = new Set();
  for (const id of Object.keys(adjList)) {
    if (!visited.has(id)) {
      if (hasCycle(id, visited, new Set())) {
        errors.push(`depends_on cycle detected involving task id "${id}"`);
        break;
      }
    }
  }

  // 6. in_progress orphan check (locked_at set but no owner, or vice versa)
  queue.tasks.forEach((task, i) => {
    if (task.status === 'in_progress') {
      if (!task.locked_at) errors.push(`task[${i}] (id=${task.id}): status=in_progress but locked_at is missing`);
      if (!task.owner) errors.push(`task[${i}] (id=${task.id}): status=in_progress but owner is missing`);
    }
  });

  // Report
  if (errors.length > 0) {
    console.error(`queue.json INVALID — ${errors.length} error(s):`);
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log(`queue.json OK — ${queue.tasks.length} tasks, no errors`);
  process.exit(0);
}

validate();
