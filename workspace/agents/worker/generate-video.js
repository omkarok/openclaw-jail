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

  // Accept multiple scene heading formats:
  //   ## SCENE 1: Title                  (canonical)
  //   ### Scene 1 (0:00–0:35) — Title   (research script format)
  //   ## Scene 1 — Title                 (variant)
  // Requires the word "Scene/SCENE" before the number to avoid false positives
  // (e.g. "## 10 Hook Options" should NOT match).
  const HEADING_RE = /^(#{2,3}[^\S\n]+SCENE[^\S\n]+\d+[^\n]*)/gim;
  const matches = [...content.matchAll(HEADING_RE)];

  if (matches.length === 0) {
    console.error('❝ No scenes found. Check ## SCENE N: format.');
    process.exit(1);
  }

  for (let i = 0; i < matches.length; i++) {
    const headingLine = matches[i][1];
    const start = matches[i].index + headingLine.length;
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
    const block = content.slice(start, end);

    // Extract title: strip hashes, "SCENE N:", bare "N:", and "(ts) — " prefixes
    let title = headingLine
      .replace(/^#{2,3}\s*/, '')
      .replace(/^SCENE\s+\d+[:\s]*/i, '')
      .replace(/^\d+[:\s]*/, '')
      .replace(/^\([^)]*\)\s*[—–-]\s*/, '')
      .trim();
    if (!title) title = block.trim().split('\n')[0].trim();

    // Accept **Visual:** or **Visual Direction:**
    const visualMatch = block.match(/\*\*Visual(?:\s+Direction)?:\*\*\s*([\s\S]+?)(?=\*\*Narration:|$)/);
    const visual = (visualMatch?.[1] || '').trim();

    const narrationMatch = block.match(/\*\*Narration:\*\*\s*([\s\S]+?)(?=\*\*Duration:|$)/);
    const narration = (narrationMatch?.[1] || '').trim();

    // Explicit **Duration:** wins; fallback: derive from heading timestamp (MM:SS–MM:SS)
    const durationMatch = block.match(/\*\*Duration:\*\*\s*(\d+)/);
    let duration = durationMatch ? parseInt(durationMatch[1]) : 0;
    if (!duration) {
      const tsMatch = headingLine.match(/\((\d+):(\d+)[–—-](\d+):(\d+)\)/);
      if (tsMatch) {
        const s0 = parseInt(tsMatch[1]) * 60 + parseInt(tsMatch[2]);
        const s1 = parseInt(tsMatch[3]) * 60 + parseInt(tsMatch[4]);
        duration = Math.max(s1 - s0, 5);
      } else {
        duration = 20;
      }
    }

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

// ── Content-driven scene renderer ─────────────────────────────────────────────
// Renders every scene from actual script content: title, narration, visual.
// 5 layout variants rotate by index for visual variety. Works with any script.

function sceneHTML(scene, index, total) {
  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const t = esc(scene.title);
  const n = esc(scene.narration);
  const v = esc(scene.visual);
  const sceneLabel = `SCENE ${String(index + 1).padStart(2, '0')}`;
  const counter = `${index + 1} / ${total}`;

  // First scene → hero. Last scene → closing. Rest → rotate 3 body layouts.
  const variant = index === 0 ? 0 : index === total - 1 ? 4 : ((index - 1) % 3) + 1;

  // ── Layout 0: Hero ── large title + narration, gradient top bar ──────────────
  if (variant === 0) return html(scene.title, `
    <div style="height:1080px;display:flex;flex-direction:column;justify-content:center;
                padding:0 140px;position:relative;">
      <div style="position:absolute;top:0;left:0;right:0;height:5px;
                  background:linear-gradient(90deg,#63b3ed,#4fd1c7,#9f7aea);"></div>
      <div style="margin-bottom:36px;">
        <span class="badge badge-blue">${sceneLabel}</span>
      </div>
      <div style="font-size:76px;font-weight:900;line-height:1.1;color:#f7fafc;
                  max-width:1400px;margin-bottom:52px;letter-spacing:-1.5px;">
        ${t}
      </div>
      ${n ? `<div style="font-size:30px;color:#a0aec0;line-height:1.75;max-width:1200px;
                         border-left:4px solid #63b3ed;padding-left:36px;">${n}</div>` : ''}
      ${v ? `<div style="margin-top:52px;font-size:18px;color:#4a5568;letter-spacing:1px;
                         text-transform:uppercase;max-width:1000px;">
               ↳ ${v.slice(0,130)}${v.length>130?'…':''}</div>` : ''}
      <div style="position:absolute;bottom:48px;right:120px;font-size:15px;
                  color:#2d3748;letter-spacing:3px;">${counter}</div>
    </div>
  `, index, total);

  // ── Layout 1: Split ── title panel left, narration right ────────────────────
  if (variant === 1) return html(scene.title, `
    <div style="height:1080px;display:flex;">
      <div style="width:480px;background:#050810;border-right:1px solid #1a2535;
                  display:flex;flex-direction:column;justify-content:center;
                  padding:80px 56px;position:relative;">
        <div style="position:absolute;top:0;left:0;bottom:0;width:4px;
                    background:linear-gradient(180deg,#63b3ed,#9f7aea);"></div>
        <span class="badge badge-blue" style="margin-bottom:36px;width:fit-content;">${sceneLabel}</span>
        <div style="font-size:42px;font-weight:900;line-height:1.2;color:#f7fafc;margin-bottom:36px;">
          ${t}
        </div>
        ${v ? `<div style="font-size:17px;color:#4a5568;line-height:1.7;font-style:italic;">
                 ${v.slice(0,220)}${v.length>220?'…':''}</div>` : ''}
      </div>
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;
                  padding:80px 100px;position:relative;">
        ${n ? `<div style="font-size:29px;color:#e2e8f0;line-height:1.85;max-width:980px;">${n}</div>`
            : `<div style="font-size:24px;color:#4a5568;font-style:italic;">No narration</div>`}
        <div style="position:absolute;bottom:48px;right:80px;font-size:15px;
                    color:#2d3748;letter-spacing:3px;">${counter}</div>
      </div>
    </div>
  `, index, total);

  // ── Layout 2: Statement ── bold title dominant, narration below ──────────────
  if (variant === 2) return html(scene.title, `
    <div style="height:1080px;display:flex;flex-direction:column;justify-content:center;
                padding:0 160px;position:relative;">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;
                  background:linear-gradient(90deg,transparent,#63b3ed,transparent);"></div>
      <div style="margin-bottom:32px;display:flex;align-items:center;gap:24px;">
        <span class="badge badge-blue">${sceneLabel}</span>
        <div style="height:1px;flex:1;background:#1a2535;"></div>
      </div>
      <div style="font-size:68px;font-weight:900;color:#f7fafc;line-height:1.15;
                  max-width:1400px;margin-bottom:56px;letter-spacing:-1px;">
        ${t}
      </div>
      ${n ? `<div style="font-size:27px;color:#718096;line-height:1.75;max-width:1200px;">${n}</div>` : ''}
      <div style="position:absolute;bottom:48px;right:120px;font-size:15px;
                  color:#2d3748;letter-spacing:3px;">${counter}</div>
    </div>
  `, index, total);

  // ── Layout 3: Narrative ── title in accent colour, narration as body ─────────
  if (variant === 3) return html(scene.title, `
    <div style="height:1080px;display:flex;flex-direction:column;justify-content:center;
                padding:0 140px;position:relative;">
      <div style="margin-bottom:24px;">
        <span class="badge badge-blue">${sceneLabel}</span>
      </div>
      <div style="font-size:44px;font-weight:800;color:#63b3ed;line-height:1.2;
                  max-width:1400px;margin-bottom:48px;">
        ${t}
      </div>
      ${n ? `<div style="font-size:28px;color:#cbd5e0;line-height:1.85;max-width:1380px;
                         border-top:1px solid #1a2535;padding-top:44px;">
               "${n}"</div>` : ''}
      ${v ? `<div style="margin-top:44px;font-size:17px;color:#4a5568;letter-spacing:1px;font-style:italic;">
               ↳ ${v.slice(0,160)}${v.length>160?'…':''}</div>` : ''}
      <div style="position:absolute;bottom:48px;right:120px;font-size:15px;
                  color:#2d3748;letter-spacing:3px;">${counter}</div>
    </div>
  `, index, total);

  // ── Layout 4: Closing ── centred, gradient accent, scene wraps up ─────────────
  return html(scene.title, `
    <div style="height:1080px;display:flex;flex-direction:column;align-items:center;
                justify-content:center;padding:0 160px;text-align:center;position:relative;">
      <div style="position:absolute;top:0;left:0;right:0;height:5px;
                  background:linear-gradient(90deg,#9f7aea,#63b3ed,#4fd1c7);"></div>
      <div style="margin-bottom:40px;">
        <span class="badge badge-blue">${sceneLabel}</span>
      </div>
      <div style="font-size:70px;font-weight:900;line-height:1.1;color:#f7fafc;
                  max-width:1300px;margin-bottom:52px;letter-spacing:-1px;">
        ${t}
      </div>
      ${n ? `<div style="font-size:29px;color:#a0aec0;line-height:1.75;max-width:1100px;
                         margin-bottom:56px;">${n}</div>` : ''}
      <div style="width:80px;height:3px;border-radius:2px;
                  background:linear-gradient(90deg,#63b3ed,#4fd1c7);"></div>
      <div style="position:absolute;bottom:48px;right:120px;font-size:15px;
                  color:#2d3748;letter-spacing:3px;">${counter}</div>
    </div>
  `, index, total);
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
