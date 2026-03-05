#!/usr/bin/env node
/**
 * chat.js — single-window group chat: You + Claude Code + Sherbyte
 * Run on host: node workspace/tools/chat.js
 */

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const BASE      = path.join(__dirname, '..');
const CHAT_FILE = path.join(BASE, 'group-chat.md');
const INBOX     = path.join(BASE, 'group-chat-inbox.json');

// ── ANSI colours ─────────────────────────────────────────────────────────────
const C = {
  reset:    '\x1b[0m',
  bold:     '\x1b[1m',
  dim:      '\x1b[2m',
  sherbyte: '\x1b[93m',
  you:      '\x1b[92m',
  claude:   '\x1b[96m',
  time:     '\x1b[90m',
  bar:      '\x1b[90m',
};

const W = process.stdout.columns || 80;

// ── Conversation history for Claude context ───────────────────────────────────
const history = [];  // [{role, content}]

// ── Helpers ───────────────────────────────────────────────────────────────────
function clearLine() { process.stdout.write('\r\x1b[K'); }

function printMsg(who, ts, text, preview) {
  clearLine();
  let color = C.dim;
  if (who === 'Sherbyte')    color = C.sherbyte;
  else if (who === 'You')    color = C.you;
  else if (who === 'Claude Code') color = C.claude;

  const time = ts ? `${C.time}${ts.slice(11,19)}${C.reset}` : '';
  const note = preview ? ` ${C.dim}(preview)${C.reset}` : '';
  process.stdout.write(`\n${color}${C.bold}${who}${C.reset} ${time}${note}\n`);
  const lines = (text || '').trim().split('\n');
  for (const l of lines) process.stdout.write(`  ${l}\n`);
  rl.prompt(true);
}

function writeChat(who, text) {
  const ts = new Date().toISOString();
  fs.appendFileSync(CHAT_FILE, `\n**[${who}]** \`${ts}\`\n${text}\n`);
  return ts;
}

// ── Claude Code subprocess ────────────────────────────────────────────────────
function askClaude(userMsg) {
  history.push({ role: 'user', content: userMsg });

  // Build context string from last 10 turns
  const ctx = history.slice(-10).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
  const prompt = `You are Claude Code, participating in a group chat alongside Sherbyte (an AI agent). Be concise — 1-3 sentences max unless detail is needed. Do not prefix your reply with "Claude Code:" or similar.\n\nConversation so far:\n${ctx}\n\nAssistant:`;

  const env = { ...process.env, CLAUDECODE: '' };
  const proc = spawn('claude', ['-p', '--no-markdown', prompt], { env, shell: true });

  let out = '';
  proc.stdout.on('data', d => { out += d.toString(); });
  proc.stderr.on('data', () => {});

  proc.on('close', () => {
    const reply = out.trim();
    if (!reply) return;
    history.push({ role: 'assistant', content: reply });
    const ts = writeChat('Claude Code', reply);
    printMsg('Claude Code', ts, reply, false);
  });
}

// ── Sherbyte via tunnel inbox ─────────────────────────────────────────────────
function askSherbyte(msg) {
  fs.appendFileSync(INBOX, JSON.stringify({ message: msg }) + '\n');
}

// ── Poll group-chat.md for new Sherbyte replies ───────────────────────────────
let chatOffset = 0;
let chatBuffer = '';

function pollChat() {
  try {
    const stat = fs.statSync(CHAT_FILE);
    if (stat.size <= chatOffset) return;
    const fd = fs.openSync(CHAT_FILE, 'r');
    const chunk = Buffer.alloc(stat.size - chatOffset);
    fs.readSync(fd, chunk, 0, chunk.length, chatOffset);
    fs.closeSync(fd);
    chatOffset = stat.size;
    chatBuffer += chunk.toString('utf8');

    const parts = chatBuffer.split(/\n(?=\*\*\[)/);
    const last = parts[parts.length - 1] || '';
    chatBuffer = (last.trim() && !last.endsWith('\n')) ? (parts.pop() || '') : '';

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed.startsWith('**[')) continue;
      const whoM    = trimmed.match(/\*\*\[(.+?)\]\*\*/);
      const tsM     = trimmed.match(/`([\dT:\-Z.]+)`/);
      const preview = trimmed.includes('(preview');
      const who     = whoM ? whoM[1] : '?';
      const ts      = tsM  ? tsM[1]  : '';
      if (who === 'You' || who === 'Claude Code') continue;  // we print these ourselves
      const text = trimmed.replace(/\*\*\[.+?\]\*\*\s*`[^`]+`[^\n]*/, '').trim();
      if (text) printMsg(who, ts, text, preview);
    }
  } catch { /* file not ready */ }
}

// ── Readline ──────────────────────────────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: `${C.you}${C.bold}You${C.reset}  `,
  terminal: true,
});

rl.on('line', (line) => {
  const msg = line.trim();
  if (!msg) { rl.prompt(); return; }

  const ts = writeChat('You', msg);
  chatOffset = fs.statSync(CHAT_FILE).size;   // skip our own [You] entry
  printMsg('You', ts, msg, false);

  askSherbyte(msg);   // → tunnel → Sherbyte
  askClaude(msg);     // → claude -p subprocess → Claude Code
  rl.prompt();
});

rl.on('close', () => { process.stdout.write('\nBye.\n'); process.exit(0); });

// ── Boot ──────────────────────────────────────────────────────────────────────
process.stdout.write('\x1b[2J\x1b[H');
process.stdout.write(`${C.bar}${'─'.repeat(W)}${C.reset}\n`);
process.stdout.write(`${C.bold}  Group Chat${C.reset}  ${C.dim}Claude Code (cyan) + Sherbyte (yellow)${C.reset}\n`);
process.stdout.write(`${C.bar}${'─'.repeat(W)}${C.reset}\n\n`);

// Drain existing history
chatOffset = 0; pollChat();

setInterval(pollChat, 400);
rl.prompt();
