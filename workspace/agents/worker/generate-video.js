/**
 * generate-video.js — Background Worker Video Generation Pipeline v2
 *
 * Pipeline:
 *   1. Playwright renders scene-specific HTML slides (1920×1080 JPEG)
 *   2. Optional: OpenAI TTS for narration audio
 *   3. ffmpeg assembles frames + audio → WebM (VP8/mjpeg image2pipe)
 *
 * Usage:
 *   node generate-video.js <script-path> <output-path>
 *
 * Environment:
 *   OPENAI_API_KEY — if set, narration audio is generated via OpenAI TTS
 *   TTS_DIR        — if set, use pre-generated MP3s (scene-000.mp3 ... scene-NNN.mp3)
 *   FFMPEG_PATH    — defaults to playwright bundled ffmpeg
 *
 * Notes:
 *   - Bundled ffmpeg is WebM/VP8 only (no mp4/h264). Output is .webm.
 *   - Input frames must be JPEG (mjpeg decoder) NOT PNG (png decoder not built).
 *   - Use concat demuxer? No. Use image2pipe at 1fps, repeat frames per duration.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

const FFMPEG = process.env.FFMPEG_PATH || '/home/node/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux';
const FPS = 1;
const SCRIPT_PATH = process.argv[2];
const OUTPUT_PATH = process.argv[3];
const PREGENERATED_TTS_DIR = process.env.TTS_DIR || null;
const WORK_DIR = path.join(path.dirname(OUTPUT_PATH), '_video_work_' + Date.now());

if (!SCRIPT_PATH || !OUTPUT_PATH) {
  console.error('Usage: node generate-video.js <script-path> <output-path>');
  process.exit(1);
}

// ── Parse video script ────────────────────────────────────────────────────────

function parseScript(content) {
  const scenes = [];
  const sceneBlocks = content.split(/^## SCENE \d+:/m).slice(1);

  for (const block of sceneBlocks) {
    const lines = block.trim().split('\n');
    const title = lines[0].trim();

    // Multi-line visual field: capture everything between **Visual:** and next **
    const visualMatch = block.match(/\*\*Visual:\*\*\s*([\s\S]+?)(?=\*\*Narration:|$)/);
    const visual = (visualMatch?.[1] || '').trim();

    const narrationMatch = block.match(/\*\*Narration:\*\*\s*([\s\S]+?)(?=\*\*Duration:|$)/);
    const narration = (narrationMatch?.[1] || '').trim();

    const durationMatch = block.match(/\*\*Duration:\*\*\s*(\d+)/);
    const duration = durationMatch ? parseInt(durationMatch[1]) : 20;

    scenes.push({ title, visual, narration, duration });
  }

  return scenes;
}

// ── Shared CSS ─────────────────────────────────────────────────────────────────

const BASE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1920px; height: 1080px; overflow: hidden;
    background: #0a0a14;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e2e8f0;
  }
  .scene-num {
    position: absolute; top: 28px; right: 48px;
    font-size: 16px; color: #2d3748; letter-spacing: 2px;
    font-weight: 600;
  }
  .badge {
    display: inline-block; padding: 4px 14px; border-radius: 20px;
    font-size: 13px; letter-spacing: 3px; text-transform: uppercase;
    font-weight: 700;
  }
  .badge-blue  { background: #1a365d; color: #63b3ed; }
  .badge-green { background: #1a3d2b; color: #48bb78; }
  .badge-red   { background: #3d1a1a; color: #fc8181; }
  .terminal {
    background: #0d1117; border: 1px solid #21262d; border-radius: 10px;
    font-family: 'Courier New', monospace; font-size: 18px;
    padding: 28px 32px; line-height: 1.8; color: #c9d1d9;
  }
  .terminal .prompt { color: #58a6ff; }
  .terminal .green  { color: #3fb950; }
  .terminal .yellow { color: #d29922; }
  .terminal .red    { color: #f85149; }
  .terminal .dim    { color: #484f58; }
  .terminal .bold   { font-weight: 700; }
  .whatsapp-bubble {
    background: #128c7e; color: white;
    border-radius: 18px 18px 4px 18px;
    padding: 14px 20px; margin-bottom: 12px;
    max-width: 740px; font-size: 22px; line-height: 1.6;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    position: relative;
  }
  .whatsapp-bubble .ts {
    font-size: 13px; color: rgba(255,255,255,0.65);
    text-align: right; margin-top: 6px;
  }
  .whatsapp-bubble.incoming {
    background: #1f2c34; border-radius: 4px 18px 18px 18px;
  }
  .metric-card {
    background: #0f1923; border: 1px solid #1a2535;
    border-radius: 16px; padding: 40px 48px; text-align: center;
  }
  .metric-card .num {
    font-size: 96px; font-weight: 900; line-height: 1;
    background: linear-gradient(135deg, #63b3ed, #4fd1c7);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .metric-card .num.green {
    background: linear-gradient(135deg, #48bb78, #68d391);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .metric-card .num.zero {
    background: linear-gradient(135deg, #f6ad55, #fc8181);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .metric-card .label { font-size: 20px; color: #718096; margin-top: 12px; letter-spacing: 2px; text-transform: uppercase; }
  .arch-box {
    border-radius: 12px; padding: 24px 32px; text-align: center;
    font-weight: 700; font-size: 22px;
  }
  .arch-box.runtime  { background: #1a2d4a; border: 2px solid #2b6cb0; color: #63b3ed; }
  .arch-box.agent    { background: #1a3d2b; border: 2px solid #276749; color: #48bb78; }
  .arch-box.worker   { background: #3d2a1a; border: 2px solid #744210; color: #f6ad55; }
  .arch-box.channel  { background: #1a1a3d; border: 2px solid #553c9a; color: #b794f4; }
  .arch-box.file     { background: #1a2d1a; border: 2px solid #2f6b2f; color: #9ae6b4; }
  .arrow {
    color: #4a5568; font-size: 28px; text-align: center;
    display: flex; align-items: center; justify-content: center;
  }
  .arrow-label { font-size: 13px; color: #4a5568; letter-spacing: 1px; margin-top: 4px; }
  .flow-step {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
  }
  .json-block {
    background: #0d1117; border: 1px solid #21262d; border-radius: 10px;
    font-family: 'Courier New', monospace; font-size: 17px; line-height: 1.9;
    padding: 24px 28px; color: #c9d1d9;
  }
  .json-block .key   { color: #79c0ff; }
  .json-block .str   { color: #a5d6ff; }
  .json-block .num   { color: #f2cc60; }
  .json-block .bool  { color: #ff7b72; }
  .json-block .grn   { color: #3fb950; }
  .json-block .red   { color: #f85149; }
  .tag-pill {
    display: inline-block; padding: 6px 16px; border-radius: 20px;
    font-size: 16px; font-weight: 700; margin: 4px;
  }
  .tag-urgent  { background: #3d1a1a; color: #fc8181; }
  .tag-high    { background: #3d2a1a; color: #f6ad55; }
  .tag-normal  { background: #1a2d4a; color: #63b3ed; }
  .tag-done    { background: #1a3d2b; color: #48bb78; }
  .tag-pending { background: #1a2435; color: #718096; }
  .divider { border: none; border-top: 1px solid #1a2535; margin: 0; }
`;

function html(title, body, sceneNum, total) {
  const safe = s => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>${BASE_CSS}</style>
</head>
<body>
  <div class="scene-num">${sceneNum + 1} / ${total}</div>
  ${body}
</body></html>`;
}

// ── Scene templates ────────────────────────────────────────────────────────────

function scene0_Hook(scene, i, total) {
  return html(scene.title, `
    <div style="display:flex; height:1080px; align-items:stretch;">

      <!-- Left: phone mockup with status bar -->
      <div style="width:520px; background:#0f0f19; border-right:1px solid #1a2535;
                  display:flex; flex-direction:column; justify-content:center; align-items:center;
                  gap:0; padding: 40px 0 40px 0;">
        <div style="background:#111827; border-radius:40px; width:340px; padding:32px 24px 40px 24px;
                    box-shadow: 0 0 60px rgba(0,0,0,0.8); border:2px solid #1f2937;">
          <!-- Status bar -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
            <span style="color:#9ca3af; font-size:16px; font-weight:600;">7:14 AM</span>
            <span style="color:#9ca3af; font-size:14px;">📶 🔋</span>
          </div>
          <!-- App icon + badge -->
          <div style="text-align:center; margin-bottom:24px;">
            <div style="display:inline-block; position:relative;">
              <div style="width:80px; height:80px; background:#25d366; border-radius:20px;
                          display:flex; align-items:center; justify-content:center; font-size:44px;">💬</div>
              <div style="position:absolute; top:-8px; right:-8px;
                          background:#ff3b30; color:white; border-radius:12px;
                          font-size:18px; font-weight:900; padding:2px 10px; min-width:28px; text-align:center;">5</div>
            </div>
            <div style="color:#9ca3af; font-size:16px; margin-top:8px;">WhatsApp</div>
          </div>
          <div style="color:#6b7280; font-size:14px; text-align:center;">New messages from Sherbyte AI</div>
        </div>
        <div style="margin-top:32px; color:#4a5568; font-size:16px; letter-spacing:2px; text-align:center;">
          PHONE WAS CHARGING<br>ALL NIGHT
        </div>
      </div>

      <!-- Right: WhatsApp DM thread -->
      <div style="flex:1; padding:60px 80px; display:flex; flex-direction:column; justify-content:center; gap:0;">
        <div style="margin-bottom:32px;">
          <div class="badge badge-green" style="margin-bottom:16px;">REAL TIMESTAMPS · REAL SYSTEM</div>
          <div style="font-size:38px; font-weight:800; color:#e2e8f0; line-height:1.2; max-width:960px;">
            You went to sleep.<br>Your AI shipped four features.
          </div>
        </div>

        <!-- WhatsApp bubbles -->
        <div style="display:flex; flex-direction:column; gap:10px; max-width:820px;">
          <div class="whatsapp-bubble" style="background:#1e3a2e;">
            ✅ Feature shipped: <strong>Notifications system</strong> is now live.
            <div class="ts">9:47 PM</div>
          </div>
          <div class="whatsapp-bubble" style="background:#1e3a2e;">
            ✅ Feature shipped: <strong>Per-attempt receipts</strong>. Every execution individually recorded.
            <div class="ts">10:12 PM</div>
          </div>
          <div class="whatsapp-bubble" style="background:#1e3a2e;">
            ✅ Feature shipped: <strong>Weekly digest generator</strong>.
            <div class="ts">11:34 PM</div>
          </div>
          <div class="whatsapp-bubble" style="background:#1e3a2e;">
            ✅ Feature shipped: <strong>Failure spike detection</strong>.
            <div class="ts">1:07 AM</div>
          </div>
          <div class="whatsapp-bubble" style="background:#155724; font-size:24px;">
            🚀 <strong>Self-improvement sprint complete!</strong> MANDATE upgraded v1.1 → v1.4
            <div class="ts">10:29 AM</div>
          </div>
        </div>
      </div>
    </div>
  `, i, total);
}

function scene1_Problem(scene, i, total) {
  return html(scene.title, `
    <div style="display:flex; height:1080px; align-items:stretch;">

      <!-- Left: Old model -->
      <div style="flex:1; background:#120a0a; border-right:2px solid #2d1515;
                  display:flex; flex-direction:column; justify-content:center; padding:80px 72px;">
        <div class="badge badge-red" style="margin-bottom:28px;">EVERY AI ASSISTANT TODAY</div>
        <div style="font-size:42px; font-weight:800; color:#fc8181; line-height:1.2; margin-bottom:40px;">
          Reactive.<br>Stateless.<br>Forgetful.
        </div>

        <div style="display:flex; flex-direction:column; gap:20px;">
          <div style="display:flex; align-items:flex-start; gap:20px;">
            <span style="font-size:28px; margin-top:2px;">💬</span>
            <div>
              <div style="font-size:20px; color:#fc8181; font-weight:700;">You type. It responds.</div>
              <div style="font-size:17px; color:#718096; margin-top:4px;">Then it ceases to exist until you message again</div>
            </div>
          </div>
          <div style="display:flex; align-items:flex-start; gap:20px;">
            <span style="font-size:28px; margin-top:2px;">🔄</span>
            <div>
              <div style="font-size:20px; color:#fc8181; font-weight:700;">Request → Response → Nothing</div>
              <div style="font-size:17px; color:#718096; margin-top:4px;">No memory of what it promised. No mechanism to act offline.</div>
            </div>
          </div>
          <div style="display:flex; align-items:flex-start; gap:20px;">
            <span style="font-size:28px; margin-top:2px;">😴</span>
            <div>
              <div style="font-size:20px; color:#fc8181; font-weight:700;">You sleep. AI sleeps.</div>
              <div style="font-size:17px; color:#718096; margin-top:4px;">Nothing runs. Nothing ships. Nothing delivers.</div>
            </div>
          </div>
        </div>

        <!-- Idle chat mockup -->
        <div style="margin-top:44px; background:#1a0a0a; border:1px solid #3d1515; border-radius:12px; padding:24px;">
          <div style="font-size:17px; color:#4a5568; margin-bottom:12px; letter-spacing:1px;">CHAT WINDOW — 9 HOURS LATER</div>
          <div style="display:flex; align-items:center; gap:12px; color:#4a5568;">
            <div style="width:12px; height:12px; border-radius:50%; background:#4a5568; animation:none;"></div>
            <span style="font-size:18px; font-family:'Courier New', monospace;">|&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            <span style="font-size:15px; color:#2d3748;">IDLE — WAITING FOR YOUR NEXT MESSAGE</span>
          </div>
        </div>
      </div>

      <!-- Right: Our model -->
      <div style="flex:1; background:#0a120a;
                  display:flex; flex-direction:column; justify-content:center; padding:80px 72px;">
        <div class="badge badge-green" style="margin-bottom:28px;">THIS SYSTEM · RIGHT NOW</div>
        <div style="font-size:42px; font-weight:800; color:#48bb78; line-height:1.2; margin-bottom:40px;">
          Proactive.<br>Persistent.<br>Autonomous.
        </div>

        <div style="display:flex; flex-direction:column; gap:20px;">
          <div style="display:flex; align-items:flex-start; gap:20px;">
            <span style="font-size:28px; margin-top:2px;">⚡</span>
            <div>
              <div style="font-size:20px; color:#48bb78; font-weight:700;">You queue a task. Walk away.</div>
              <div style="font-size:17px; color:#718096; margin-top:4px;">Worker executes while you're offline, asleep, unreachable</div>
            </div>
          </div>
          <div style="display:flex; align-items:flex-start; gap:20px;">
            <span style="font-size:28px; margin-top:2px;">🧠</span>
            <div>
              <div style="font-size:20px; color:#48bb78; font-weight:700;">Queue state is truth</div>
              <div style="font-size:17px; color:#718096; margin-top:4px;">Crash the worker, restart it — picks up exactly where it left off</div>
            </div>
          </div>
          <div style="display:flex; align-items:flex-start; gap:20px;">
            <span style="font-size:28px; margin-top:2px;">📲</span>
            <div>
              <div style="font-size:20px; color:#48bb78; font-weight:700;">Results find you</div>
              <div style="font-size:17px; color:#718096; margin-top:4px;">Heartbeat delivers to WhatsApp DM. No polling. No checking.</div>
            </div>
          </div>
        </div>

        <div style="margin-top:44px; background:#0a1a0a; border:1px solid #1a3d1a; border-radius:12px; padding:24px;">
          <div style="font-size:17px; color:#2d6b2d; margin-bottom:12px; letter-spacing:1px;">WORKER LOG — 3:47 AM</div>
          <div style="font-family:'Courier New', monospace; font-size:17px; color:#3fb950; line-height:1.8;">
            [03:47:12] t007 → status: in_progress<br>
            [03:47:58] t007 → status: done ✓<br>
            [03:48:01] Notification queued → WhatsApp
          </div>
        </div>
      </div>
    </div>
  `, i, total);
}

function scene2_Architecture(scene, i, total) {
  return html(scene.title, `
    <div style="height:1080px; display:flex; flex-direction:column;
                justify-content:center; padding:60px 120px; gap:32px;">

      <div style="text-align:center; margin-bottom:8px;">
        <div class="badge badge-blue" style="margin-bottom:16px;">THREE LAYERS · CLEAN SEPARATION OF CONCERNS</div>
        <div style="font-size:44px; font-weight:800; color:#e2e8f0;">The Architecture That Makes Autonomy Possible</div>
      </div>

      <!-- Layer diagram -->
      <div style="display:grid; grid-template-columns:1fr 60px 1fr 60px 1fr; align-items:center; gap:0; margin-top:16px;">

        <!-- OpenClaw -->
        <div style="background:#0f1f35; border:2px solid #2b6cb0; border-radius:20px; padding:48px 40px; text-align:center;">
          <div style="font-size:52px; margin-bottom:16px;">🔗</div>
          <div style="font-size:28px; font-weight:800; color:#63b3ed; margin-bottom:8px;">OpenClaw</div>
          <div style="font-size:16px; color:#4a90d9; margin-bottom:24px; letter-spacing:1px; text-transform:uppercase;">Runtime · Gateway · Channels</div>
          <hr class="divider" style="margin-bottom:20px; border-color:#1a3d6b;">
          <div style="font-size:16px; color:#718096; line-height:2;">
            WhatsApp (Baileys)<br>
            Discord<br>
            WebSocket :18789<br>
            Security audit: 0 crit · 0 warn<br>
            uid=1000 · read-only FS
          </div>
        </div>

        <!-- Arrow 1 -->
        <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
          <div style="font-size:32px; color:#2b6cb0;">→</div>
          <div style="font-size:12px; color:#2d3748; letter-spacing:1px; text-align:center; writing-mode:horizontal-tb;">routes</div>
        </div>

        <!-- Sherbyte -->
        <div style="background:#0f2a1a; border:2px solid #276749; border-radius:20px; padding:48px 40px; text-align:center;">
          <div style="font-size:52px; margin-bottom:16px;">🧠</div>
          <div style="font-size:28px; font-weight:800; color:#48bb78; margin-bottom:8px;">Sherbyte</div>
          <div style="font-size:16px; color:#38a169; margin-bottom:24px; letter-spacing:1px; text-transform:uppercase;">Agent · Bridge · Heartbeat</div>
          <hr class="divider" style="margin-bottom:20px; border-color:#1a3d2b;">
          <div style="font-size:16px; color:#718096; line-height:2;">
            Real-time conversations<br>
            !task intake → queue.json<br>
            30-min heartbeat loop<br>
            Reads notifications.json<br>
            Delivers to your DM
          </div>
        </div>

        <!-- Arrow 2 -->
        <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
          <div style="font-size:32px; color:#276749;">→</div>
          <div style="font-size:12px; color:#2d3748; letter-spacing:1px; text-align:center;">queues</div>
        </div>

        <!-- Background Worker -->
        <div style="background:#2a1a0a; border:2px solid #744210; border-radius:20px; padding:48px 40px; text-align:center;">
          <div style="font-size:52px; margin-bottom:16px;">⚙️</div>
          <div style="font-size:28px; font-weight:800; color:#f6ad55; margin-bottom:8px;">Background Worker</div>
          <div style="font-size:16px; color:#c47f17; margin-bottom:24px; letter-spacing:1px; text-transform:uppercase;">Headless · Executor · Cron</div>
          <hr class="divider" style="margin-bottom:20px; border-color:#3d2a0a;">
          <div style="font-size:16px; color:#718096; line-height:2;">
            No chat interface<br>
            Reads MANDATE.md<br>
            Drains queue.json<br>
            Cron: 08:00 IST daily<br>
            Writes notifications.json
          </div>
        </div>
      </div>

      <!-- File layer -->
      <div style="display:flex; justify-content:center; gap:24px; margin-top:8px;">
        <div class="arch-box file" style="font-size:16px; padding:14px 24px;">📄 queue.json</div>
        <div class="arch-box file" style="font-size:16px; padding:14px 24px;">📄 notifications.json</div>
        <div class="arch-box file" style="font-size:16px; padding:14px 24px;">📄 escalations.json</div>
        <div class="arch-box file" style="font-size:16px; padding:14px 24px;">📄 MANDATE.md</div>
        <div class="arch-box file" style="font-size:16px; padding:14px 24px;">📁 results/</div>
      </div>
      <div style="text-align:center; font-size:15px; color:#2d3748; letter-spacing:2px;">
        FLAT JSON FILES — AUDITABLE · CRASH-SAFE · ZERO COUPLING
      </div>
    </div>
  `, i, total);
}

function scene3_OpenClaw(scene, i, total) {
  return html(scene.title, `
    <div style="display:flex; height:1080px; align-items:stretch;">

      <!-- Left: Security posture -->
      <div style="width:680px; padding:80px 64px; display:flex; flex-direction:column; justify-content:center; border-right:1px solid #1a2535;">
        <div class="badge badge-blue" style="margin-bottom:28px;">OPENCLAW RUNTIME · SECURITY AUDIT</div>
        <div style="font-size:42px; font-weight:800; color:#e2e8f0; margin-bottom:48px;">
          Production-grade.<br>You own it.
        </div>

        <!-- Big stats -->
        <div style="display:flex; gap:32px; margin-bottom:48px;">
          <div style="text-align:center;">
            <div style="font-size:88px; font-weight:900; color:#48bb78; line-height:1;">0</div>
            <div style="font-size:17px; color:#718096; letter-spacing:2px; text-transform:uppercase;">Critical</div>
          </div>
          <div style="color:#2d3748; font-size:48px; display:flex; align-items:center;">·</div>
          <div style="text-align:center;">
            <div style="font-size:88px; font-weight:900; color:#48bb78; line-height:1;">0</div>
            <div style="font-size:17px; color:#718096; letter-spacing:2px; text-transform:uppercase;">Warnings</div>
          </div>
        </div>

        <!-- Security constraints -->
        <div style="display:flex; flex-direction:column; gap:16px;">
          <div style="display:flex; gap:16px; align-items:center;">
            <span style="color:#48bb78; font-size:20px;">🔒</span>
            <span style="font-size:18px; color:#a0aec0;">Read-only root filesystem</span>
          </div>
          <div style="display:flex; gap:16px; align-items:center;">
            <span style="color:#48bb78; font-size:20px;">🔒</span>
            <span style="font-size:18px; color:#a0aec0;">Non-root user (uid=1000, node)</span>
          </div>
          <div style="display:flex; gap:16px; align-items:center;">
            <span style="color:#48bb78; font-size:20px;">🔒</span>
            <span style="font-size:18px; color:#a0aec0;">All Linux capabilities dropped</span>
          </div>
          <div style="display:flex; gap:16px; align-items:center;">
            <span style="color:#48bb78; font-size:20px;">🔒</span>
            <span style="font-size:18px; color:#a0aec0;">Localhost-only bind (127.0.0.1:18789)</span>
          </div>
          <div style="display:flex; gap:16px; align-items:center;">
            <span style="color:#48bb78; font-size:20px;">🔒</span>
            <span style="font-size:18px; color:#a0aec0;">Metadata endpoint blocked (DOCKER-USER chain)</span>
          </div>
        </div>
      </div>

      <!-- Right: Terminal output -->
      <div style="flex:1; padding:80px 64px; display:flex; flex-direction:column; justify-content:center; gap:28px;">
        <div class="terminal">
          <div class="dim">$ docker compose exec openclaw openclaw security audit</div>
          <br>
          <div class="green bold">✓ gateway.bind: lan (not public)</div>
          <div class="green bold">✓ dmPolicy: allowlist</div>
          <div class="green bold">✓ allowFrom: ["+919892787587"] — 1 number</div>
          <div class="green bold">✓ canvas.eval: blocked permanently</div>
          <div class="green bold">✓ root filesystem: read-only</div>
          <div class="green bold">✓ container user: uid=1000 (node)</div>
          <div class="green bold">✓ metadata endpoint: unreachable</div>
          <br>
          <div class="bold" style="color:#3fb950; font-size:22px;">Security score: 9/10</div>
          <div class="dim">0 critical · 0 warnings</div>
        </div>

        <div class="json-block" style="font-size:16px;">
<span class="key">"channels"</span>: {
  <span class="key">"whatsapp"</span>: {
    <span class="key">"dmPolicy"</span>: <span class="str">"allowlist"</span>,
    <span class="key">"allowFrom"</span>: [<span class="str">"+919892787587"</span>],
    <span class="key">"groupPolicy"</span>: <span class="str">"allowlist"</span>
  }
},
<span class="key">"gateway"</span>: {
  <span class="key">"bind"</span>: <span class="str">"lan"</span>,
  <span class="key">"port"</span>: <span class="num">18789</span>,
  <span class="key">"nodes"</span>: { <span class="key">"denyCommands"</span>: [<span class="str">"canvas.eval"</span>, ...] }
}
        </div>
      </div>
    </div>
  `, i, total);
}

function scene4_Sherbyte(scene, i, total) {
  return html(scene.title, `
    <div style="height:1080px; display:flex; flex-direction:column;
                justify-content:center; padding:80px 120px; gap:48px;">

      <div>
        <div class="badge badge-green" style="margin-bottom:16px;">SHERBYTE · PERSONAL AI BRIDGE</div>
        <div style="font-size:42px; font-weight:800; color:#e2e8f0;">
          From your WhatsApp message to task execution in seconds
        </div>
      </div>

      <!-- !task flow -->
      <div style="display:flex; align-items:center; gap:0;">

        <!-- Step 1: WhatsApp input -->
        <div style="flex:1;">
          <div style="background:#0f1a0f; border:2px solid #1a4a1a; border-radius:16px; padding:28px 24px;">
            <div style="font-size:15px; color:#2d6b2d; letter-spacing:2px; margin-bottom:16px;">WHATSAPP GROUP · 10:11 PM</div>
            <div style="background:#1f2c34; border-radius:12px; padding:16px 20px; font-size:19px; color:#e2e8f0; font-family:'Courier New',monospace;">
              !task research: top 5 LLM agent<br>frameworks in 2026
            </div>
            <div style="font-size:14px; color:#2d6b2d; margin-top:12px; text-align:right;">✓✓ delivered</div>
          </div>
        </div>

        <div style="padding:0 24px; text-align:center;">
          <div style="font-size:36px; color:#276749;">→</div>
          <div style="font-size:13px; color:#2d3748; letter-spacing:1px;">parses</div>
        </div>

        <!-- Step 2: Sherbyte processing -->
        <div style="flex:1;">
          <div class="terminal" style="font-size:16px;">
            <div class="dim">Sherbyte: received !task</div>
            <div class="green">→ type: research</div>
            <div class="green">→ priority: normal</div>
            <div class="green">→ id: t-1772618323</div>
            <div class="green">→ Appending to queue.json</div>
            <div class="green">→ Firing worker trigger</div>
            <div class="yellow">✓ Queued. Runs at 08:00 IST</div>
          </div>
        </div>

        <div style="padding:0 24px; text-align:center;">
          <div style="font-size:36px; color:#276749;">→</div>
          <div style="font-size:13px; color:#2d3748; letter-spacing:1px;">delivers</div>
        </div>

        <!-- Step 3: Result DM -->
        <div style="flex:1;">
          <div style="background:#0f1a0f; border:2px solid #1a4a1a; border-radius:16px; padding:28px 24px;">
            <div style="font-size:15px; color:#2d6b2d; letter-spacing:2px; margin-bottom:16px;">WHATSAPP DM · NEXT MORNING</div>
            <div class="whatsapp-bubble" style="background:#1e3a2e; font-size:18px;">
              ✅ Research done: Top 5 LLM agent frameworks in 2026<br>
              <span style="font-size:15px; color:#4a9a6a;">Result: workspace/results/t-1772618323.md</span>
              <div class="ts">10:11 AM</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Heartbeat pulse -->
      <div style="background:#0a120a; border:1px solid #1a3d1a; border-radius:16px; padding:32px 48px;">
        <div style="display:flex; align-items:center; gap:48px;">
          <div style="font-size:17px; color:#2d6b2d; letter-spacing:2px; text-transform:uppercase; white-space:nowrap;">30-MIN HEARTBEAT</div>
          <div style="flex:1; display:flex; gap:8px; align-items:center;">
            ${[...Array(16)].map((_, k) => `<div style="flex:1; height:${k===8?48:k===4||k===12?36:20}px; background:${k===8?'#48bb78':k===4||k===12?'#276749':'#1a3d1a'}; border-radius:4px;"></div>`).join('')}
          </div>
          <div style="font-size:17px; color:#48bb78; white-space:nowrap; text-align:right;">
            Reads notifications.json<br>
            <span style="color:#2d6b2d; font-size:15px;">Delivers → marks sent:true</span>
          </div>
        </div>
      </div>
    </div>
  `, i, total);
}

function scene5_Worker(scene, i, total) {
  return html(scene.title, `
    <div style="display:flex; height:1080px; align-items:stretch;">

      <!-- Left: MANDATE quote + design philosophy -->
      <div style="width:660px; padding:80px 64px; display:flex; flex-direction:column; justify-content:center; gap:32px; border-right:1px solid #1a2535;">
        <div class="badge" style="background:#2a1a0a; color:#f6ad55; margin-bottom:0;">MANDATE.md v1.6 · THE WORKER'S CONSTITUTION</div>

        <div style="background:#1a0f00; border-left:4px solid #f6ad55; border-radius:0 12px 12px 0; padding:32px 36px;">
          <div style="font-size:22px; color:#f6ad55; font-style:italic; line-height:1.7; margin-bottom:20px;">
            "You are an autonomous background execution agent. You have no WhatsApp interface. You process a task queue, write results to files, and escalate when human input is needed. You do not chat. You execute."
          </div>
          <div style="font-size:15px; color:#744210; letter-spacing:2px;">— MANDATE.md, line 3</div>
        </div>

        <div style="display:flex; flex-direction:column; gap:16px;">
          <div style="display:flex; gap:16px;">
            <span style="color:#f6ad55; font-size:20px; margin-top:2px;">⚡</span>
            <div>
              <div style="font-size:18px; color:#e2e8f0; font-weight:700;">Explicit trigger</div>
              <div style="font-size:15px; color:#718096;">Fires immediately after task enqueue</div>
            </div>
          </div>
          <div style="display:flex; gap:16px;">
            <span style="color:#f6ad55; font-size:20px; margin-top:2px;">🕐</span>
            <div>
              <div style="font-size:18px; color:#e2e8f0; font-weight:700;">Daily cron · 08:00 IST</div>
              <div style="font-size:15px; color:#718096;">Recovery sweep — catches anything missed</div>
            </div>
          </div>
          <div style="display:flex; gap:16px;">
            <span style="color:#f6ad55; font-size:20px; margin-top:2px;">♻️</span>
            <div>
              <div style="font-size:18px; color:#e2e8f0; font-weight:700;">Crash recovery built-in</div>
              <div style="font-size:15px; color:#718096;">Stale lock after 30m → reset & retry</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Live terminal -->
      <div style="flex:1; padding:80px 64px; display:flex; flex-direction:column; justify-content:center; gap:28px;">
        <div style="font-size:22px; color:#718096; letter-spacing:2px;">LIVE EXECUTION LOG</div>

        <div class="terminal" style="flex:1; max-height:520px;">
          <div class="dim">$ openclaw agent run --agent background-worker</div>
          <br>
          <div class="green">[08:00:01] Background Worker v1.6 starting</div>
          <div class="dim">[08:00:01] Reading MANDATE.md... OK (v1.6)</div>
          <div class="dim">[08:00:02] Loading queue.json... 3 tasks pending</div>
          <div class="dim">[08:00:02] Step 0: resetting recurring tasks...</div>
          <div class="green">[08:00:02] t001 recurring → pending (24h elapsed)</div>
          <div class="dim">[08:00:03] Step 1: crash recovery... 0 stale tasks</div>
          <div class="dim">[08:00:03] Step 2: block check... 0 blocked</div>
          <br>
          <div class="yellow">[08:00:03] Processing t009 [priority: urgent]</div>
          <div class="dim">[08:00:03] → status: in_progress | locked_at: now</div>
          <div class="dim">[08:00:03] → Executing type: research</div>
          <div class="dim">[08:00:47] → Writing result to results/t009.md</div>
          <div class="green">[08:00:47] → Quality gate: PASS (4,821 chars)</div>
          <div class="green">[08:00:47] → status: done | Notification queued</div>
          <br>
          <div class="green bold">[08:00:48] Run complete. Receipt written.</div>
        </div>
      </div>
    </div>
  `, i, total);
}

function scene6_TaskQueue(scene, i, total) {
  const tasks = [
    { id:'t001', title:'memory-digest (recurring)', priority:'normal', status:'done', dep:'—' },
    { id:'t002', title:'vault-health (recurring)', priority:'normal', status:'done', dep:'—' },
    { id:'t003', title:'run-health (recurring)', priority:'normal', status:'done', dep:'—' },
    { id:'t007', title:'failure-spike-detection', priority:'high', status:'done', dep:'t005,t006' },
    { id:'t008', title:'mandate-self-improvement', priority:'high', status:'done', dep:'t007' },
    { id:'t-ma-research', title:'multi-agent explainer research', priority:'normal', status:'done', dep:'—' },
    { id:'t-1772618323', title:'LLM agent frameworks 2026', priority:'normal', status:'done', dep:'—' },
  ];

  const statusColor = s => s === 'done' ? '#48bb78' : s === 'in_progress' ? '#f6ad55' : '#718096';
  const priorityColor = p => ({ urgent:'#fc8181', high:'#f6ad55', normal:'#63b3ed', low:'#718096' })[p] || '#718096';

  return html(scene.title, `
    <div style="height:1080px; display:flex; flex-direction:column;
                justify-content:center; padding:60px 100px; gap:36px;">

      <div>
        <div class="badge badge-blue" style="margin-bottom:16px;">QUEUE.JSON · SCHEMA V2 · SINGLE SOURCE OF TRUTH</div>
        <div style="font-size:42px; font-weight:800; color:#e2e8f0;">
          A DAG with priorities, backoff, and self-healing crash recovery
        </div>
      </div>

      <!-- Task table -->
      <div style="background:#0d1117; border:1px solid #21262d; border-radius:14px; overflow:hidden;">
        <div style="display:grid; grid-template-columns:160px 1fr 120px 100px 200px;
                    background:#161b22; padding:14px 24px;
                    font-size:14px; color:#4a5568; letter-spacing:2px; text-transform:uppercase; font-weight:700;">
          <div>Task ID</div><div>Title</div><div>Priority</div><div>Status</div><div>depends_on</div>
        </div>
        ${tasks.map(t => `
          <div style="display:grid; grid-template-columns:160px 1fr 120px 100px 200px;
                      padding:14px 24px; border-top:1px solid #0d1117;
                      font-size:16px; font-family:'Courier New',monospace; align-items:center;">
            <div style="color:#79c0ff;">${t.id}</div>
            <div style="color:#c9d1d9; font-family:'Segoe UI',sans-serif; font-size:15px;">${t.title}</div>
            <div><span class="tag-pill" style="background:${priorityColor(t.priority)}22; color:${priorityColor(t.priority)}; font-size:13px;">${t.priority}</span></div>
            <div style="color:${statusColor(t.status)}; font-weight:700;">${t.status}</div>
            <div style="color:#4a5568; font-size:14px;">${t.dep}</div>
          </div>
        `).join('')}
      </div>

      <!-- Bottom: JSON + concepts -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:32px;">
        <div class="json-block" style="font-size:15px;">
{
  <span class="key">"id"</span>: <span class="str">"t007"</span>,
  <span class="key">"priority"</span>: <span class="str">"high"</span>,
  <span class="key">"status"</span>: <span class="grn">"done"</span>,
  <span class="key">"depends_on"</span>: [<span class="str">"t005"</span>, <span class="str">"t006"</span>],
  <span class="key">"retries"</span>: <span class="num">0</span>, <span class="key">"max_retries"</span>: <span class="num">3</span>,
  <span class="key">"run_after"</span>: <span class="bool">null</span>,
  <span class="key">"locked_at"</span>: <span class="bool">null</span>
}
        </div>
        <div style="display:flex; flex-direction:column; gap:16px; justify-content:center;">
          <div style="display:flex; gap:12px; align-items:flex-start;">
            <span style="color:#63b3ed; font-size:20px; margin-top:2px;">📊</span>
            <div style="font-size:17px; color:#a0aec0;">Priority sort every cycle: urgent → high → normal → low</div>
          </div>
          <div style="display:flex; gap:12px; align-items:flex-start;">
            <span style="color:#63b3ed; font-size:20px; margin-top:2px;">🔗</span>
            <div style="font-size:17px; color:#a0aec0;">DAG via depends_on — worker never executes blocked tasks</div>
          </div>
          <div style="display:flex; gap:12px; align-items:flex-start;">
            <span style="color:#63b3ed; font-size:20px; margin-top:2px;">🔄</span>
            <div style="font-size:17px; color:#a0aec0;">Backoff: attempt 1→1min, 2→2min, 3→4min (max 1hr)</div>
          </div>
          <div style="display:flex; gap:12px; align-items:flex-start;">
            <span style="color:#63b3ed; font-size:20px; margin-top:2px;">⏰</span>
            <div style="font-size:17px; color:#a0aec0;">Stale lock_at >30min → auto-reset and retry</div>
          </div>
        </div>
      </div>
    </div>
  `, i, total);
}

function scene7_SelfImprovement(scene, i, total) {
  return html(scene.title, `
    <div style="height:1080px; display:flex; flex-direction:column;
                justify-content:center; padding:60px 100px; gap:36px;">

      <div>
        <div class="badge" style="background:#1a0a3d; color:#b794f4; margin-bottom:16px;">SELF-IMPROVEMENT SPRINT · MANDATE EVOLUTION</div>
        <div style="font-size:40px; font-weight:800; color:#e2e8f0; line-height:1.2;">
          The worker rewrote its own operating instructions.<br>
          <span style="color:#b794f4;">We did not intervene once.</span>
        </div>
      </div>

      <!-- Version comparison -->
      <div style="display:grid; grid-template-columns:1fr 80px 1fr; gap:0; align-items:stretch;">

        <!-- v1.1 -->
        <div style="background:#0d1117; border:1px solid #21262d; border-radius:14px 0 0 14px; padding:36px 40px;">
          <div style="font-size:15px; color:#4a5568; letter-spacing:2px; margin-bottom:16px;">MANDATE v1.1 — BEFORE SPRINT</div>
          <div style="font-family:'Courier New',monospace; font-size:16px; line-height:2.0; color:#484f58;">
            <div>Task types: memory-digest</div>
            <div>Task types: vault-health</div>
            <div>Task types: run-health</div>
            <div>Task types: research</div>
            <div style="color:#2d3748; text-decoration:line-through;">notifications system — ✗</div>
            <div style="color:#2d3748; text-decoration:line-through;">per-attempt receipts — ✗</div>
            <div style="color:#2d3748; text-decoration:line-through;">weekly digest — ✗</div>
            <div style="color:#2d3748; text-decoration:line-through;">failure spike detection — ✗</div>
            <div style="color:#2d3748; text-decoration:line-through;">quality gate — ✗</div>
            <div style="color:#2d3748; text-decoration:line-through;">WORKER_STATUS.md — ✗</div>
          </div>
        </div>

        <!-- Arrow + task list -->
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; background:#0a0a14; border-top:1px solid #21262d; border-bottom:1px solid #21262d;">
          <div style="font-size:13px; color:#2d3748; letter-spacing:1px; writing-mode:vertical-lr; transform:rotate(180deg);">5 tasks overnight</div>
          <div style="font-size:32px; color:#b794f4;">→</div>
          <div style="font-size:13px; color:#2d3748; letter-spacing:1px; writing-mode:vertical-lr; transform:rotate(180deg);">no human intervention</div>
        </div>

        <!-- v1.6 -->
        <div style="background:#0d1117; border:1px solid #553c9a; border-radius:0 14px 14px 0; padding:36px 40px;">
          <div style="font-size:15px; color:#6b46c1; letter-spacing:2px; margin-bottom:16px;">MANDATE v1.6 — AFTER SPRINT</div>
          <div style="font-family:'Courier New',monospace; font-size:16px; line-height:2.0;">
            <div style="color:#c9d1d9;">Task types: memory-digest</div>
            <div style="color:#c9d1d9;">Task types: vault-health, run-health, research</div>
            <div style="color:#3fb950;">+ notifications system (t004) ✓</div>
            <div style="color:#3fb950;">+ per-attempt receipts (t005) ✓</div>
            <div style="color:#3fb950;">+ weekly digest (t006) ✓</div>
            <div style="color:#3fb950;">+ failure spike detection (t007) ✓</div>
            <div style="color:#3fb950;">+ mandatory quality gate (t008) ✓</div>
            <div style="color:#3fb950;">+ WORKER_STATUS.md (t008) ✓</div>
            <div style="color:#3fb950;">+ concurrent guard (t008) ✓</div>
          </div>
        </div>
      </div>

      <!-- Task progress -->
      <div style="display:flex; gap:16px; align-items:center;">
        ${['t004', 't005', 't006', 't007', 't008'].map(t => `
          <div style="flex:1; background:#0f1923; border:1px solid #276749; border-radius:12px; padding:20px; text-align:center;">
            <div style="font-size:28px; margin-bottom:8px;">✅</div>
            <div style="font-family:'Courier New',monospace; font-size:16px; color:#48bb78;">${t}</div>
            <div style="font-size:13px; color:#2d6b2d; margin-top:4px;">done</div>
          </div>
        `).join('')}
        <div style="font-size:32px; color:#b794f4; padding:0 8px;">→</div>
        <div style="flex:1.5; background:#1a0a3d; border:2px solid #553c9a; border-radius:12px; padding:20px; text-align:center;">
          <div style="font-size:28px; margin-bottom:8px;">🚀</div>
          <div style="font-size:18px; color:#b794f4; font-weight:700;">MANDATE</div>
          <div style="font-size:15px; color:#6b46c1;">v1.1 → v1.6</div>
        </div>
      </div>
    </div>
  `, i, total);
}

function scene8_TaskDemo(scene, i, total) {
  return html(scene.title, `
    <div style="height:1080px; display:flex; flex-direction:column;
                justify-content:center; padding:60px 100px; gap:40px;">

      <div>
        <div class="badge badge-green" style="margin-bottom:16px;">END-TO-END DEMO · ZERO MANUAL STEPS</div>
        <div style="font-size:42px; font-weight:800; color:#e2e8f0;">
          Eleven words in. Structured research result out.
        </div>
      </div>

      <!-- Three-panel timeline -->
      <div style="display:grid; grid-template-columns:1fr 60px 1fr 60px 1fr; align-items:center;">

        <!-- Panel 1: Input -->
        <div style="background:#0f1a0f; border:2px solid #276749; border-radius:16px; padding:36px 32px;">
          <div style="font-size:14px; color:#2d6b2d; letter-spacing:2px; margin-bottom:20px;">WHATSAPP GROUP · 10:11 PM</div>
          <div style="background:#1f2c34; border-radius:12px; padding:20px; margin-bottom:16px;">
            <div style="font-size:19px; color:#e2e8f0; font-family:'Courier New',monospace; line-height:1.8;">
              !task research: top 5 most<br>practical LLM agent frameworks<br>in 2026
            </div>
            <div style="font-size:13px; color:#4a5568; text-align:right; margin-top:8px;">✓✓ 10:11 PM</div>
          </div>
          <div style="font-size:15px; color:#2d6b2d;">Sherbyte queues task t-1772618323<br>Worker trigger fired immediately</div>
        </div>

        <div style="text-align:center;">
          <div style="font-size:36px; color:#276749;">→</div>
          <div style="font-size:12px; color:#2d3748; letter-spacing:1px;">overnight</div>
        </div>

        <!-- Panel 2: Worker execution -->
        <div>
          <div class="terminal" style="font-size:15px;">
            <div class="dim">[08:00:03] t-1772618323 → in_progress</div>
            <div class="dim">[08:00:03] type: research</div>
            <div class="dim">[08:00:04] Reading context files...</div>
            <div class="dim">[08:01:12] Researching LLM frameworks...</div>
            <div class="dim">[08:04:33] Synthesising findings...</div>
            <div class="green">[08:05:47] Writing results/t-1772618323.md</div>
            <div class="green">[08:05:48] Quality gate: PASS (7,234 chars)</div>
            <div class="green">[08:05:48] status: done</div>
            <div class="green">[08:05:48] Notification queued → sent:false</div>
            <br>
            <div class="dim">Duration: 5m 45s</div>
          </div>
          <div style="margin-top:16px; text-align:center; font-size:15px; color:#4a5568;">
            No tab open. No terminal watching. Just running.
          </div>
        </div>

        <div style="text-align:center;">
          <div style="font-size:36px; color:#276749;">→</div>
          <div style="font-size:12px; color:#2d3748; letter-spacing:1px;">next heartbeat</div>
        </div>

        <!-- Panel 3: Result -->
        <div style="background:#0f1a0f; border:2px solid #276749; border-radius:16px; padding:36px 32px;">
          <div style="font-size:14px; color:#2d6b2d; letter-spacing:2px; margin-bottom:20px;">WHATSAPP DM · NEXT MORNING</div>
          <div class="whatsapp-bubble" style="background:#1e3a2e; font-size:18px; max-width:100%;">
            ✅ Research done: Top 5 LLM agent frameworks in 2026
            <div style="font-size:14px; color:#4a9a6a; margin-top:8px;">Results at: workspace/results/t-1772618323.md</div>
            <div class="ts">08:36 AM</div>
          </div>
          <div style="margin-top:16px; font-size:15px; color:#2d6b2d;">
            Sherbyte heartbeat found sent:false<br>
            Delivered → marked sent:true
          </div>
        </div>
      </div>

      <!-- Bottom stat -->
      <div style="text-align:center; background:#0a120a; border:1px solid #1a3d1a; border-radius:12px; padding:24px;">
        <span style="font-size:22px; color:#48bb78; font-weight:700;">11 words typed &nbsp;→&nbsp; 7,234 word research result &nbsp;·&nbsp; approx 8 hours &nbsp;·&nbsp; zero manual steps</span>
      </div>
    </div>
  `, i, total);
}

function scene9_NotificationLoop(scene, i, total) {
  return html(scene.title, `
    <div style="height:1080px; display:flex; flex-direction:column;
                justify-content:center; padding:80px 120px; gap:48px;">

      <div>
        <div class="badge badge-blue" style="margin-bottom:16px;">NOTIFICATION PIPELINE · DEAD-SIMPLE BY DESIGN</div>
        <div style="font-size:40px; font-weight:800; color:#e2e8f0; line-height:1.2;">
          No Kafka. No Redis. No message broker.<br>
          <span style="color:#63b3ed;">A file, a loop, and a flag.</span>
        </div>
      </div>

      <!-- Flow diagram -->
      <div style="display:flex; align-items:center; gap:0;">

        <div class="flow-step" style="flex:1;">
          <div class="arch-box worker" style="width:100%; font-size:19px; padding:28px 20px;">
            ⚙️ Background Worker
            <div style="font-size:14px; color:#744210; font-weight:400; margin-top:8px;">completes task</div>
          </div>
        </div>

        <div style="padding:0 20px; text-align:center;">
          <div style="font-size:28px; color:#4a5568;">→</div>
          <div style="font-size:12px; color:#2d3748; letter-spacing:1px;">writes</div>
        </div>

        <!-- JSON state: before -->
        <div style="flex:1.6;">
          <div class="json-block" style="font-size:15px; line-height:2.0;">
<span class="key">"id"</span>: <span class="str">"n005"</span>,
<span class="key">"message"</span>: <span class="str">"🚀 Sprint complete!"</span>,
<span class="key">"sent"</span>: <span class="red">false</span>,
<span class="key">"sent_at"</span>: <span class="bool">null</span>
          </div>
          <div style="text-align:center; font-size:14px; color:#4a5568; margin-top:8px;">notifications.json — sent: false</div>
        </div>

        <div style="padding:0 20px; text-align:center;">
          <div style="font-size:20px; color:#4a5568; margin-bottom:4px;">⏰ 30 min</div>
          <div style="font-size:28px; color:#4a5568;">→</div>
          <div style="font-size:12px; color:#2d3748; letter-spacing:1px;">heartbeat fires</div>
        </div>

        <!-- Sherbyte -->
        <div class="flow-step" style="flex:1;">
          <div class="arch-box agent" style="width:100%; font-size:19px; padding:28px 20px;">
            🧠 Sherbyte
            <div style="font-size:14px; color:#276749; font-weight:400; margin-top:8px;">finds sent:false</div>
          </div>
        </div>

        <div style="padding:0 20px; text-align:center;">
          <div style="font-size:28px; color:#4a5568;">→</div>
          <div style="font-size:12px; color:#2d3748; letter-spacing:1px;">delivers</div>
        </div>

        <!-- WhatsApp -->
        <div style="flex:1;">
          <div class="whatsapp-bubble" style="background:#1e3a2e; font-size:17px;">
            🚀 Sprint complete!<br>MANDATE upgraded v1.4
            <div class="ts">10:29 AM</div>
          </div>
        </div>
      </div>

      <!-- After state -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:32px;">
        <div>
          <div style="font-size:15px; color:#2d6b2d; letter-spacing:2px; margin-bottom:12px;">AFTER DELIVERY</div>
          <div class="json-block" style="font-size:15px; line-height:2.0;">
<span class="key">"id"</span>: <span class="str">"n005"</span>,
<span class="key">"sent"</span>: <span class="grn">true</span>,
<span class="key">"sent_at"</span>: <span class="str">"2026-03-04T10:29:02Z"</span>
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:16px; justify-content:center;">
          <div style="font-size:18px; color:#a0aec0;">
            If Sherbyte crashes mid-delivery — notification stays <code style="color:#fc8181; font-size:16px;">sent:false</code>
            and delivers on next heartbeat. Idempotent by design.
          </div>
          <div style="font-size:18px; color:#a0aec0;">
            Max delivery window: <strong style="color:#63b3ed;">30 minutes</strong> &nbsp;·&nbsp;
            Duplicates: <strong style="color:#48bb78;">impossible</strong>
          </div>
        </div>
      </div>
    </div>
  `, i, total);
}

function scene10_Results(scene, i, total) {
  return html(scene.title, `
    <div style="height:1080px; display:flex; flex-direction:column;
                justify-content:center; padding:80px 120px; gap:48px;">

      <div>
        <div class="badge badge-green" style="margin-bottom:16px;">PRODUCTION RESULTS · LIVE SYSTEM · REAL NUMBERS</div>
        <div style="font-size:42px; font-weight:800; color:#e2e8f0; line-height:1.2;">
          This is not a benchmark.<br>This is running on one laptop.
        </div>
      </div>

      <!-- Main metrics -->
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:24px;">
        <div class="metric-card">
          <div class="num green">13</div>
          <div class="label">Tasks<br>Completed</div>
        </div>
        <div class="metric-card">
          <div class="num zero">0</div>
          <div class="label">Task<br>Failures</div>
        </div>
        <div class="metric-card">
          <div class="num">5</div>
          <div class="label">WhatsApp<br>Notifications</div>
        </div>
        <div class="metric-card">
          <div class="num green">3</div>
          <div class="label">MANDATE<br>Self-Upgrades</div>
        </div>
      </div>

      <!-- Run receipts -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:28px;">
        <div>
          <div style="font-size:15px; color:#4a5568; letter-spacing:2px; margin-bottom:12px;">RUN RECEIPT · 2026-03-03</div>
          <div class="terminal" style="font-size:16px; line-height:2.0;">
            <div class="dim">mandate_version: "1.3"</div>
            <div class="green">tasks_processed: 5</div>
            <div class="green">tasks_completed: 5</div>
            <div class="red">tasks_failed: 0</div>
            <div class="dim">escalations_raised: 0</div>
            <div class="green">summary: "All 5 self-improvement tasks done"</div>
          </div>
        </div>
        <div>
          <div style="font-size:15px; color:#4a5568; letter-spacing:2px; margin-bottom:12px;">RUN RECEIPT · 2026-03-04</div>
          <div class="terminal" style="font-size:16px; line-height:2.0;">
            <div class="dim">mandate_version: "1.5"</div>
            <div class="green">tasks_processed: 8</div>
            <div class="green">tasks_completed: 8</div>
            <div class="red">tasks_failed: 0</div>
            <div class="dim">escalations_raised: 0</div>
            <div class="green">summary: "Explainer sprint: 8/8 done"</div>
          </div>
        </div>
      </div>

      <div style="text-align:center; font-size:19px; color:#718096; font-style:italic;">
        "The system is not just autonomous. It is observable. Observability is the only thing that lets you trust autonomy enough to actually sleep."
      </div>
    </div>
  `, i, total);
}

function scene11_CTA(scene, i, total) {
  return html(scene.title, `
    <div style="height:1080px; display:flex; flex-direction:column;
                justify-content:center; align-items:center; padding:80px 160px; text-align:center; gap:48px;">

      <div>
        <div class="badge badge-blue" style="margin-bottom:24px;">OPEN ARCHITECTURE · SWAP ANYTHING · OWN EVERYTHING</div>
        <div style="font-size:52px; font-weight:900; color:#e2e8f0; line-height:1.2; max-width:1400px;">
          None of this is proprietary glue.
        </div>
      </div>

      <!-- Replaceable components -->
      <div style="display:flex; gap:32px; width:100%;">
        <div style="flex:1; background:#0f1f35; border:2px solid #2b6cb0; border-radius:16px; padding:36px 28px; text-align:left;">
          <div style="font-size:22px; font-weight:700; color:#63b3ed; margin-bottom:8px;">OpenClaw Runtime</div>
          <div style="font-size:15px; color:#2b6cb0; margin-bottom:16px;">→ your runtime, your channels</div>
          <div style="font-size:16px; color:#718096; line-height:1.8;">
            Swap channels, add SMS, add Discord.<br>Architecture doesn't change.
          </div>
        </div>
        <div style="flex:1; background:#0f2a1a; border:2px solid #276749; border-radius:16px; padding:36px 28px; text-align:left;">
          <div style="font-size:22px; font-weight:700; color:#48bb78; margin-bottom:8px;">Sherbyte Agent</div>
          <div style="font-size:15px; color:#276749; margin-bottom:16px;">→ your agent logic, your persona</div>
          <div style="font-size:16px; color:#718096; line-height:1.8;">
            Any LLM. Any personality.<br>Heartbeat loop stays the same.
          </div>
        </div>
        <div style="flex:1; background:#2a1a0a; border:2px solid #744210; border-radius:16px; padding:36px 28px; text-align:left;">
          <div style="font-size:22px; font-weight:700; color:#f6ad55; margin-bottom:8px;">Background Worker</div>
          <div style="font-size:15px; color:#744210; margin-bottom:16px;">→ your MANDATE, your task types</div>
          <div style="font-size:16px; color:#718096; line-height:1.8;">
            Markdown file + JSON queue.<br>You version-control both.
          </div>
        </div>
      </div>

      <!-- Stats recap -->
      <div style="display:flex; gap:48px; align-items:center;">
        <div style="font-size:20px; color:#48bb78; font-weight:700;">13 tasks</div>
        <div style="color:#2d3748;">·</div>
        <div style="font-size:20px; color:#48bb78; font-weight:700;">0 failures</div>
        <div style="color:#2d3748;">·</div>
        <div style="font-size:20px; color:#48bb78; font-weight:700;">5 notifications</div>
        <div style="color:#2d3748;">·</div>
        <div style="font-size:20px; color:#48bb78; font-weight:700;">3 self-upgrades</div>
        <div style="color:#2d3748;">·</div>
        <div style="font-size:20px; color:#48bb78; font-weight:700;">1 laptop</div>
      </div>

      <!-- CTA -->
      <div style="background:linear-gradient(135deg, #1a2d4a, #0a1a2d); border:2px solid #2b6cb0; border-radius:20px; padding:48px 80px;">
        <div style="font-size:40px; font-weight:900; color:#e2e8f0; margin-bottom:16px; line-height:1.3;">
          What would your agent do tonight<br>while you sleep?
        </div>
        <div style="font-size:20px; color:#4a90d9;">
          MANDATE.md + queue.json + a cron job.<br>That's the entire API.
        </div>
      </div>
    </div>
  `, i, total);
}

// ── Scene dispatcher ───────────────────────────────────────────────────────────

function sceneHTML(scene, index, total) {
  const templates = [
    scene0_Hook,
    scene1_Problem,
    scene2_Architecture,
    scene3_OpenClaw,
    scene4_Sherbyte,
    scene5_Worker,
    scene6_TaskQueue,
    scene7_SelfImprovement,
    scene8_TaskDemo,
    scene9_NotificationLoop,
    scene10_Results,
    scene11_CTA,
  ];
  const fn = templates[index];
  if (!fn) {
    // Fallback for unexpected scene count
    return html(scene.title, `
      <div style="height:1080px; display:flex; flex-direction:column; justify-content:center; padding:80px 120px; gap:32px;">
        <div class="badge badge-blue">${index + 1} / ${total}</div>
        <div style="font-size:56px; font-weight:800; line-height:1.2;">${scene.title.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        ${scene.visual ? `<div style="font-size:24px; color:#718096; max-width:1400px; line-height:1.7;">${scene.visual.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>` : ''}
      </div>
    `, index, total);
  }
  return fn(scene, index, total);
}

// ── TTS via Microsoft Edge Read Aloud (free, no API key) ─────────────────────
// Uses native Node.js 22 WebSocket — no npm packages needed.
// Protocol: wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1
// Returns MP3 audio as a Buffer.

const EDGE_TTS_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_TTS_VOICE = process.env.EDGE_TTS_VOICE || 'en-US-GuyNeural'; // deep, clear voice

function randomHex(len) {
  return [...Array(len)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

function edgeTTSHeaders(voice, text) {
  const requestId = randomHex(32).toUpperCase();
  const timestamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
  <voice name='${voice}'>
    <prosody rate='-5%' pitch='-5Hz'>${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</prosody>
  </voice>
</speak>`;

  const configMsg =
    `X-Timestamp:${timestamp}\r\n` +
    `Content-Type:application/json; charset=utf-8\r\n` +
    `Path:speech.config\r\n\r\n` +
    JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false }, outputFormat: 'audio-24khz-48kbitrate-mono-mp3' } } } });

  const ssmlMsg =
    `X-RequestId:${requestId}\r\n` +
    `Content-Type:application/ssml+xml\r\n` +
    `X-Timestamp:${timestamp}Z\r\n` +
    `Path:ssml\r\n\r\n` +
    ssml;

  return { configMsg, ssmlMsg, requestId };
}

async function generateTTS(text, outputFile) {
  if (!text || text.trim().length === 0) return null;

  console.log(`  [TTS] Edge TTS for scene (${text.length} chars)...`);

  return new Promise((resolve) => {
    const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TTS_TOKEN}&ConnectionId=${randomHex(32).toUpperCase()}`;

    const ws = new WebSocket(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      }
    });

    const audioParts = [];
    let done = false;

    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        ws.close();
        console.warn('  [TTS] Timeout — skipping audio for this scene');
        resolve(null);
      }
    }, 30000);

    ws.binaryType = 'arraybuffer';

    ws.addEventListener('open', () => {
      const { configMsg, ssmlMsg } = edgeTTSHeaders(EDGE_TTS_VOICE, text);
      ws.send(configMsg);
      ws.send(ssmlMsg);
    });

    ws.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        if (event.data.includes('Path:turn.end')) {
          done = true;
          clearTimeout(timeout);
          ws.close();
          if (audioParts.length === 0) { resolve(null); return; }
          const totalLen = audioParts.reduce((s, b) => s + b.byteLength, 0);
          const merged = Buffer.alloc(totalLen);
          let offset = 0;
          for (const part of audioParts) {
            Buffer.from(part).copy(merged, offset);
            offset += part.byteLength;
          }
          fs.writeFileSync(outputFile, merged);
          console.log(`  [TTS] ${merged.length} bytes → ${path.basename(outputFile)}`);
          resolve(outputFile);
        }
      } else {
        // Binary: audio data prefixed by a header ending in "Path:audio\r\n\r\n"
        const buf = event.data;
        const header = Buffer.from(buf.slice(0, 2)).readUInt16BE(0);
        const audioStart = header + 2;
        if (audioStart < buf.byteLength) {
          audioParts.push(buf.slice(audioStart));
        }
      }
    });

    ws.addEventListener('error', (e) => {
      if (!done) {
        done = true;
        clearTimeout(timeout);
        console.warn(`  [TTS] WebSocket error: ${e.message || e.type} — skipping`);
        resolve(null);
      }
    });

    ws.addEventListener('close', () => {
      if (!done) { done = true; clearTimeout(timeout); resolve(null); }
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log('🎬 Video generation v2 starting...');
  console.log(`   Script: ${SCRIPT_PATH}`);
  console.log(`   Output: ${OUTPUT_PATH}`);

  const scriptContent = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const scenes = parseScript(scriptContent);
  if (scenes.length === 0) {
    console.error('❌ No scenes found. Check ## SCENE N: format.');
    process.exit(1);
  }
  console.log(`✅ Parsed ${scenes.length} scenes`);

  fs.mkdirSync(WORK_DIR, { recursive: true });
  const framesDir = path.join(WORK_DIR, 'frames');
  const audioDir  = path.join(WORK_DIR, 'audio');
  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync(audioDir,  { recursive: true });

  // Render slides
  console.log('🖼️  Rendering slides...');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const htmlFile = path.join(WORK_DIR, `scene-${i}.html`);
    const jpgFile  = path.join(framesDir, `frame-${String(i).padStart(3, '0')}.jpg`);
    fs.writeFileSync(htmlFile, sceneHTML(scene, i, scenes.length));
    await page.goto(`file://${htmlFile}`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: jpgFile, type: 'jpeg', quality: 92 });
    console.log(`  [${i+1}/${scenes.length}] ${scene.title.slice(0, 60)}`);
  }
  await browser.close();
  console.log('✅ All slides rendered');

  // TTS — check for pre-generated files first, then fall back to API
  const audioFiles = [];
  const durations  = [];
  let hasAudio = false;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const audioFile = path.join(audioDir, `scene-${i}.mp3`);

    // Check for pre-generated TTS file (from host-side edge-tts run)
    const pregen = PREGENERATED_TTS_DIR
      ? path.join(PREGENERATED_TTS_DIR, `scene-${String(i).padStart(3, '0')}.mp3`)
      : null;

    let result = null;
    if (pregen && fs.existsSync(pregen)) {
      fs.copyFileSync(pregen, audioFile);
      result = audioFile;
      const sz = fs.statSync(audioFile).size;
      console.log(`  [TTS] Pre-generated: scene-${i} (${Math.round(sz/1024)}KB)`);
    } else {
      result = await generateTTS(scene.narration, audioFile);
    }

    if (result) {
      hasAudio = true;
      audioFiles.push(audioFile);
      durations.push(Math.ceil(scene.duration) + 1);
    } else {
      audioFiles.push(null);
      durations.push(scene.duration);
    }
  }

  // Assemble video via image2pipe (mjpeg — bundled ffmpeg has no png decoder)
  console.log('🎞️  Assembling video (image2pipe/mjpeg → WebM)...');
  const frameList = [];
  for (let i = 0; i < scenes.length; i++) {
    const jpgFile = path.join(framesDir, `frame-${String(i).padStart(3, '0')}.jpg`);
    for (let t = 0; t < durations[i]; t++) frameList.push(jpgFile);
  }
  console.log(`   Total: ${frameList.length}s at ${FPS}fps`);

  const outPath = OUTPUT_PATH.replace(/\.mp4$/i, '.webm');
  if (outPath !== OUTPUT_PATH) console.log(`   Note: output is .webm (bundled ffmpeg is WebM-only)`);

  const pipeFrames = (ff) => new Promise((res, rej) => {
    ff.on('error', rej);
    ff.on('close', code => code === 0 ? res() : rej(new Error(`ffmpeg exit ${code}`)));
    (async () => {
      for (const p of frameList) {
        const data = fs.readFileSync(p);
        await new Promise(r => ff.stdin.write(data, r));
      }
      ff.stdin.end();
    })();
  });

  if (!hasAudio) {
    const ff = spawn(FFMPEG, [
      '-f', 'image2pipe', '-r', String(FPS), '-vcodec', 'mjpeg', '-i', 'pipe:0',
      '-c:v', 'libvpx', '-b:v', '4M', '-auto-alt-ref', '0', '-y', outPath
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    await pipeFrames(ff);
  } else {
    // Generate silence for scenes without TTS
    for (let i = 0; i < scenes.length; i++) {
      if (!audioFiles[i]) {
        const sf = path.join(audioDir, `silence-${i}.webm`);
        spawnSync(FFMPEG, ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono',
          '-t', String(durations[i]), '-c:a', 'libvorbis', '-y', sf], { stdio: 'inherit' });
        audioFiles[i] = sf;
      }
    }
    const mergedAudio = path.join(WORK_DIR, 'narration.webm');
    const valid = audioFiles.filter(Boolean);
    const concatArgs = [];
    valid.forEach(f => concatArgs.push('-i', f));
    concatArgs.push('-filter_complex', `concat=n=${valid.length}:v=0:a=1[outa]`,
      '-map', '[outa]', '-c:a', 'libvorbis', '-y', mergedAudio);
    const ar = spawnSync(FFMPEG, concatArgs, { stdio: 'inherit' });
    if (ar.status !== 0) {
      console.warn('  ⚠️  Audio merge failed — falling back to silent');
      const ff = spawn(FFMPEG, [
        '-f', 'image2pipe', '-r', String(FPS), '-vcodec', 'mjpeg', '-i', 'pipe:0',
        '-c:v', 'libvpx', '-b:v', '4M', '-auto-alt-ref', '0', '-y', outPath
      ], { stdio: ['pipe', 'inherit', 'inherit'] });
      await pipeFrames(ff);
    } else {
      const ff = spawn(FFMPEG, [
        '-f', 'image2pipe', '-r', String(FPS), '-vcodec', 'mjpeg', '-i', 'pipe:0',
        '-i', mergedAudio,
        '-c:v', 'libvpx', '-b:v', '4M', '-auto-alt-ref', '0',
        '-c:a', 'libvorbis', '-shortest', '-y', outPath
      ], { stdio: ['pipe', 'inherit', 'inherit'] });
      await pipeFrames(ff);
    }
  }

  const stats = fs.statSync(outPath);
  console.log(`\n✅ Video ready: ${outPath}`);
  console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`   Duration: ~${frameList.length}s`);
  console.log(`   Scenes: ${scenes.length}`);
  console.log(`   Audio: ${hasAudio ? 'TTS narration' : 'silent'}`);

  fs.rmSync(WORK_DIR, { recursive: true, force: true });
})().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
