#!/usr/bin/env node
// chat-view.js — live messenger-style view of group-chat.md
// Run: node workspace/tools/chat-view.js  (on host, outside Docker)

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../group-chat.md');

const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  claude:  '\x1b[96m',   // cyan
  sherbyte:'\x1b[93m',   // yellow
  you:     '\x1b[92m',   // green
  time:    '\x1b[90m',   // gray
  line:    '\x1b[90m',   // gray
};

function fmt(block) {
  // block: "**[Sherbyte]** `ts`\ntext" or "**[You]** `ts`\ntext"
  const whoMatch = block.match(/\*\*\[(.+?)\]\*\*/);
  const tsMatch  = block.match(/`([\d\-T:Z.]+)`/);
  const who = whoMatch ? whoMatch[1] : '?';
  const ts  = tsMatch  ? tsMatch[1].slice(11,19) : '';  // HH:MM:SS
  const text = block
    .replace(/\*\*\[.+?\]\*\*\s*`[^`]+`\s*_?\(.*?\)_?/, '')
    .trim();

  let color = C.dim;
  if (who === 'Claude Code') color = C.claude;
  else if (who === 'Sherbyte') color = C.sherbyte;
  else if (who === 'You') color = C.you;

  const label = `${color}${C.bold}${who}${C.reset}`;
  const time  = `${C.time}${ts}${C.reset}`;
  console.log(`\n${label} ${time}`);
  if (text) console.log(`  ${text.replace(/\n/g, '\n  ')}`);
}

let offset = 0;
let buffer = '';

function poll() {
  try {
    const stat = fs.statSync(FILE);
    if (stat.size <= offset) return;
    const fd = fs.openSync(FILE, 'r');
    const chunk = Buffer.alloc(stat.size - offset);
    fs.readSync(fd, chunk, 0, chunk.length, offset);
    fs.closeSync(fd);
    offset = stat.size;
    buffer += chunk.toString('utf8');

    // Split on entry boundaries (blank line before **)
    const parts = buffer.split(/\n(?=\*\*\[)/);
    // Last part may be incomplete — hold it
    buffer = parts.pop() || '';
    for (const p of parts) {
      const trimmed = p.trim();
      if (trimmed.startsWith('**[')) fmt(trimmed);
    }
  } catch { /* file not ready yet */ }
}

// Print header
console.clear();
console.log(`${C.line}${'─'.repeat(50)}${C.reset}`);
console.log(`${C.bold}  Group Chat${C.reset}  ${C.dim}Claude Code + Sherbyte${C.reset}`);
console.log(`${C.line}${'─'.repeat(50)}${C.reset}`);
console.log(`${C.dim}  watching ${FILE}${C.reset}\n`);

// Drain existing content on start
offset = 0;
poll();

// Then live-poll every 400ms
setInterval(poll, 400);
