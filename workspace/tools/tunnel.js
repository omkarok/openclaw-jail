#!/usr/bin/env node
/**
 * tunnel.js — Persistent WS session to Sherbyte, no cold-start per message.
 * Usage inside container:
 *   node /home/node/workspace/tools/tunnel.js
 *
 * Send a message: write one JSON line to INBOX_FILE:
 *   {"message":"your text here"}
 *
 * Sherbyte's response streams into TEE_FILE and stdout.
 */

const WebSocket = require('/usr/local/lib/node_modules/openclaw/node_modules/ws');
const fs = require('fs');
const { randomUUID } = require('crypto');

const GATEWAY_URL  = 'ws://127.0.0.1:18789';
const TOKEN        = 'd4e1821c124d0c9e85a334c7a6cdd831c671278c0a5ff181';
const SESSION_KEY  = 'whatsapp:direct:+919892787587';
const INBOX_FILE   = '/home/node/workspace/group-chat-inbox.json';
const TEE_FILE     = '/home/node/workspace/group-chat.md';

// Ensure files exist
if (!fs.existsSync(INBOX_FILE)) fs.writeFileSync(INBOX_FILE, '');
if (!fs.existsSync(TEE_FILE))   fs.writeFileSync(TEE_FILE, '# Group Chat — Claude Code ↔ Sherbyte\n\n');

let ws = null;
let connected = false;
let pendingNonce = null;
let pendingResponses = {}; // runId -> { latestText }
let inboxOffset = fs.existsSync(INBOX_FILE) ? fs.statSync(INBOX_FILE).size : 0;

// ── WS helpers ───────────────────────────────────────────────────────────────

function send(obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('[tunnel] not connected — message dropped');
    return;
  }
  ws.send(JSON.stringify(obj));
}

function request(method, params, expectFinal = false) {
  const id = randomUUID();
  send({ type: 'req', id, method, params });
  return id;
}

// ── Connect ──────────────────────────────────────────────────────────────────

function connect() {
  console.log('[tunnel] connecting to', GATEWAY_URL);
  ws = new WebSocket(GATEWAY_URL, { maxPayload: 25 * 1024 * 1024 });

  ws.on('open', () => console.log('[tunnel] ws open — waiting for challenge'));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // ── Challenge/response handshake ──
    if (msg.event === 'connect.challenge') {
      pendingNonce = msg.payload?.nonce ?? null;
      console.log('[tunnel] challenge received, nonce=' + pendingNonce + ', sending connect');
      request('connect', {
        minProtocol: 3, maxProtocol: 3,
        client: {
          id: 'cli',
          version: 'tunnel/1.0',
          platform: process.platform,
          mode: 'cli'
        },
        auth: { token: TOKEN },
        role: 'operator',
        scopes: ['operator.admin', 'operator.read', 'operator.write'],
        caps: []
      });
      return;
    }

    // ── Connect ok ──
    if (msg.type === 'res' && msg.ok && !connected) {
      connected = true;
      console.log('[tunnel] ✅ connected and authenticated — ready');
      // Keepalive: send last-heartbeat every 20s so server doesn't drop idle connection
      const keepalive = setInterval(() => {
        if (!connected || !ws || ws.readyState !== WebSocket.OPEN) { clearInterval(keepalive); return; }
        request('last-heartbeat', {});
      }, 20000);
      return;
    }

    // ── Agent stream events ──
    if (msg.event === 'agent') {
      const p = msg.payload || {};
      const runId = p.runId || p.run;
      const stream = p.stream;
      const text   = p.text;
      const phase  = p.phase;

      if (!runId) return;

      if (stream === 'assistant' && text) {
        // Text is the LATEST accumulated response so far — track by runId
        pendingResponses[runId] = pendingResponses[runId] || { latestText: '', done: false };
        pendingResponses[runId].latestText = text;
      }

      if (stream === 'lifecycle' && phase === 'end') {
        const resp = pendingResponses[runId];
        if (resp && resp.latestText) {
          const ts = new Date().toISOString();
          const line = `\n**[Sherbyte]** \`${ts}\`\n${resp.latestText}\n`;
          process.stdout.write(line);
          fs.appendFileSync(TEE_FILE, line);
        }
        delete pendingResponses[runId];
      }
    }
  });

  ws.on('close', (code, reason) => {
    const reasonStr = reason?.toString() || '';
    connected = false;
    ws = null;
    if (code === 1002) {
      // Protocol mismatch — back off longer, likely a transient auth/rate issue
      console.warn(`[tunnel] ws closed (${code}) ${reasonStr} — backing off 30s before retry`);
      setTimeout(connect, 30000);
    } else {
      console.warn(`[tunnel] ws closed (${code}) ${reasonStr} — reconnecting in 2s`);
      setTimeout(connect, 2000);
    }
  });

  ws.on('error', (err) => {
    console.error('[tunnel] ws error:', err.message);
  });
}

// ── Inbox poller ─────────────────────────────────────────────────────────────

function pollInbox() {
  setInterval(() => {
    if (!connected) return;
    try {
      const stat = fs.statSync(INBOX_FILE);
      if (stat.size <= inboxOffset) return;

      const fd = fs.openSync(INBOX_FILE, 'r');
      const buf = Buffer.alloc(stat.size - inboxOffset);
      fs.readSync(fd, buf, 0, buf.length, inboxOffset);
      fs.closeSync(fd);
      inboxOffset = stat.size;

      const lines = buf.toString('utf8').split('\n').filter(l => l.trim());
      for (const line of lines) {
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (!msg.message) continue;

        const idempotencyKey = randomUUID();
        console.log(`[tunnel] → Sherbyte: "${msg.message.slice(0, 60)}..."`);
        request('agent', {
          message: msg.message,
          to: '+919892787587',
          sessionKey: SESSION_KEY,
          idempotencyKey,
          deliver: false  // don't send back to WhatsApp — we're the tee
        }, true);

        // [You] entries written by chat.js — don't duplicate here
      }
    } catch (e) {
      // non-fatal
    }
  }, 300);
}

// ── Boot ─────────────────────────────────────────────────────────────────────

process.stdout.write('[tunnel] starting — inbox: ' + INBOX_FILE + '\n');
process.stdout.write('[tunnel] tee output: ' + TEE_FILE + '\n');
connect();
// Start inbox poller immediately — it guards on `connected` internally
pollInbox();
