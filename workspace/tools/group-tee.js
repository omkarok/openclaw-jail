#!/usr/bin/env node
/**
 * group-tee.js — Tees Sherbyte's WhatsApp responses into group-chat.md
 * Run inside container: node /home/node/workspace/tools/group-tee.js
 */

const fs = require('fs');

const LOG_FILE   = '/var/log/openclaw/gateway.log';
const TEE_FILE   = '/home/node/workspace/group-chat.md';
const POLL_MS    = 500;

// Init tee file if missing
if (!fs.existsSync(TEE_FILE)) {
  fs.writeFileSync(TEE_FILE, '# Group Chat — Claude Code + Sherbyte\n\n');
}

let logOffset = fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE).size : 0;

// Per-run state: track latest accumulated text
const runs = {}; // runPrefix -> { lastText, session }

function poll() {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size <= logOffset) return;

    const fd = fs.openSync(LOG_FILE, 'r');
    const buf = Buffer.alloc(stat.size - logOffset);
    fs.readSync(fd, buf, 0, buf.length, logOffset);
    fs.closeSync(fd);
    logOffset = stat.size;

    const lines = buf.toString('utf8').split('\n');
    for (const line of lines) {
      if (!line) continue;

      // Capture streaming text: ...stream=assistant aseq=N text=<full accumulated text>
      const textMatch = line.match(/run=(\S+).*stream=assistant\s+aseq=(\d+)\s+text=(.+)$/);
      if (textMatch) {
        const [, runId, aseqStr, text] = textMatch;
        const aseq = parseInt(aseqStr, 10);
        if (!runs[runId]) runs[runId] = { lastAseq: -1, lastText: '', session: '' };
        if (aseq > runs[runId].lastAseq) {
          runs[runId].lastAseq = aseq;
          runs[runId].lastText = text;
        }
        // Capture session
        const sessMatch = line.match(/session=(\S+)/);
        if (sessMatch) runs[runId].session = sessMatch[1];
        continue;
      }

      // Run end: stream=lifecycle phase=end
      const endMatch = line.match(/run=(\S+).*stream=lifecycle.*phase=end/);
      if (endMatch) {
        const runId = endMatch[1];
        if (runs[runId] && runs[runId].lastText) {
          const ts = new Date().toISOString();
          const text = runs[runId].lastText.replace(/…$/, ''); // strip log-truncation marker
          const truncated = runs[runId].lastText.endsWith('…');
          const note = truncated ? ' _(preview — full reply on WhatsApp)_' : '';
          const entry = `\n**[Sherbyte]** \`${ts}\`${note}\n${text}\n`;
          fs.appendFileSync(TEE_FILE, entry);
          process.stdout.write(`[tee] Sherbyte response captured (aseq=${runs[runId].lastAseq})\n`);
        }
        delete runs[runId];
        continue;
      }
    }
  } catch (e) {
    // non-fatal
  }
}

process.stdout.write(`[group-tee] watching ${LOG_FILE} → ${TEE_FILE}\n`);
setInterval(poll, POLL_MS);
