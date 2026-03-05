import json, datetime

with open('/home/node/workspace/task-queue/queue.json', encoding='utf-8') as f:
    q = json.load(f)

now = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')

new_tasks = [
  # ── FOUNDATION ─────────────────────────────────────────────────────────────
  {
    'id': 't-ma-research',
    'title': 'Multi-agent architecture content brief',
    'priority': 'high',
    'type': 'research',
    'status': 'pending',
    'recurring': False,
    'created': now,
    'created_by': 'claude-code',
    'retries': 0,
    'max_retries': 2,
    'run_after': None,
    'depends_on': [],
    'locked_at': None,
    'owner': None,
    'completed_at': None,
    'error': None,
    'input': {
      'description': (
        'Read these files and compile a content brief for explainer content about this '
        'multi-agent architecture. Files to read: '
        '/home/node/workspace/agents/worker/MANDATE.md, '
        '/home/node/workspace/AGENTS.md, '
        '/home/node/workspace/SOUL.md, '
        '/home/node/workspace/task-queue/queue.json, '
        'and the latest 3 run receipts in /home/node/workspace/agents/worker/runs/. '
        'Extract: (1) Architecture overview: Sherbyte + Background Worker + OpenClaw. '
        '(2) Key features: task DAG, failure taxonomy, crash recovery, escalation loop, '
        'notifications, recurring tasks, self-improvement sprint. '
        '(3) Hero moments: worker self-upgraded MANDATE v1.1->v1.3, !task from WhatsApp groups, '
        'full autonomous pipeline. '
        '(4) ASCII architecture diagram (3-layer hub-and-spoke). '
        '(5) Demo moments: queue.json with tasks, run receipts, notifications delivered. '
        'Write to /home/node/workspace/results/ma-content-brief.md with sections: '
        'Overview, Architecture Diagram (ASCII), Key Features, Hero Moments, '
        'Demo Assets (actual file snippets), Target Audience, Key Messages, Talking Points.'
      )
    },
    'output_path': '/home/node/workspace/results/ma-content-brief.md',
    'escalate_after_ms': 3600000,
    'tags': ['explainer-sprint', 'foundation']
  },

  # ── PARALLEL CONTENT (all depend on research) ───────────────────────────────
  {
    'id': 't-ma-post',
    'title': 'Thought-leader social post 800w',
    'priority': 'normal',
    'type': 'self-improvement',
    'status': 'pending',
    'recurring': False,
    'created': now,
    'created_by': 'claude-code',
    'retries': 0,
    'max_retries': 2,
    'run_after': None,
    'depends_on': ['t-ma-research'],
    'locked_at': None,
    'owner': None,
    'completed_at': None,
    'error': None,
    'input': {
      'description': 'Write an 800-word thought-leader social post about this multi-agent AI architecture.',
      'steps': [
        '1. Read /home/node/workspace/results/ma-content-brief.md',
        ('2. Write an 800-word thought-leader post to /home/node/workspace/results/ma-social-post.md. '
         'Style: LinkedIn/X, first-person, concrete and specific, no buzzwords, conversational but authoritative. '
         'Structure: Hook (something surprising happened while I slept) -> The problem with reactive AI -> '
         'Our 3-layer architecture (OpenClaw runtime + Sherbyte personal bridge + Background Worker) -> '
         'The self-improvement hero moment (worker rewrote its own MANDATE from v1.1 to v1.3 overnight) -> '
         'The !task feature (type in WhatsApp group, result arrives autonomously) -> '
         'What this means for the future of AI assistants -> CTA. '
         'Include ASCII architecture diagram inline. Count words, aim for 780-820 words.'),
        ('3. Read the written post back from the file. '
         'Append to /home/node/workspace/notifications.json: '
         'id "n-ma-post", sent false, '
         'message beginning with "📝 Thought-leader post (800w):\n\n" followed by the FULL post text.')
      ]
    },
    'output_path': '/home/node/workspace/results/ma-social-post.md',
    'escalate_after_ms': 3600000,
    'tags': ['explainer-sprint', 'content']
  },

  {
    'id': 't-ma-video-script',
    'title': 'Demo explainer video — full script + TTS narration',
    'priority': 'normal',
    'type': 'self-improvement',
    'status': 'pending',
    'recurring': False,
    'created': now,
    'created_by': 'claude-code',
    'retries': 0,
    'max_retries': 2,
    'run_after': None,
    'depends_on': ['t-ma-research'],
    'locked_at': None,
    'owner': None,
    'completed_at': None,
    'error': None,
    'input': {
      'description': 'Write full demo-style explainer video script with narration text ready for TTS.',
      'steps': [
        '1. Read /home/node/workspace/results/ma-content-brief.md',
        ('2. Write a complete video script to /home/node/workspace/results/ma-video-script.md. '
         'This is a DEMO-STYLE video showing the actual system working. '
         'Structure each scene as:\n'
         '## SCENE N: [Title]\n'
         '**Visual:** [what is on screen — actual file content, terminal, WhatsApp UI, diagram]\n'
         '**Narration:** [exact words to speak, written for TTS — natural, no stage directions]\n'
         '**Duration:** [seconds]\n'
         '**Demo asset:** [which file/screenshot to show, e.g. queue.json, run receipt, WhatsApp message]\n\n'
         '12 scenes covering: '
         '(1) Hook: WhatsApp shows a task notification arriving — "your AI sent you this while you slept". '
         '(2) Problem: reactive AI just waits for prompts. '
         '(3) Solution overview: 3-layer architecture diagram. '
         '(4) OpenClaw: the cross-channel runtime fabric. '
         '(5) Sherbyte: personal AI, real-time bridge, heartbeat loop. '
         '(6) Background Worker: headless, cron-driven, reads MANDATE.md. '
         '(7) Task queue in action: show queue.json with actual tasks. '
         '(8) DAG execution: depends_on, parallel tasks, how t001+t002 unlock t003. '
         '(9) Self-improvement hero: worker rewrites MANDATE v1.1->v1.3 — show the diff. '
         '(10) !task demo: user types in WhatsApp group, result arrives 8 hours later. '
         '(11) Notification receipts: show the actual WhatsApp messages received. '
         '(12) CTA: this is open architecture, here is how to build it. '
         'After all scenes, write a ## NARRATION ONLY section with JUST the narration text '
         'concatenated scene by scene (for feeding to TTS as one document).'),
        ('3. Append to /home/node/workspace/notifications.json: '
         'id "n-ma-video", sent false, '
         'message "🎬 Video script ready (12 scenes, demo-style with TTS narration)\n'
         'Script: /home/node/workspace/results/ma-video-script.md\n'
         'Narration section ready for TTS. Next: TTS audio generation (t-ma-tts) and screenshots (t-ma-screenshots)."')
      ]
    },
    'output_path': '/home/node/workspace/results/ma-video-script.md',
    'escalate_after_ms': 3600000,
    'tags': ['explainer-sprint', 'content']
  },

  {
    'id': 't-ma-screenshots',
    'title': 'Demo screenshot assets — system in action',
    'priority': 'normal',
    'type': 'self-improvement',
    'status': 'pending',
    'recurring': False,
    'created': now,
    'created_by': 'claude-code',
    'retries': 0,
    'max_retries': 2,
    'run_after': None,
    'depends_on': ['t-ma-research'],
    'locked_at': None,
    'owner': None,
    'completed_at': None,
    'error': None,
    'input': {
      'description': 'Generate demo screenshot assets showing the system working in action.',
      'steps': [
        '1. Create directory /home/node/workspace/results/demo-assets/ by writing a .keep file there.',
        ('2. Read /home/node/workspace/task-queue/queue.json and write a formatted "screenshot" '
         'of the task queue to /home/node/workspace/results/demo-assets/01-task-queue.md. '
         'Format it as a beautiful terminal-style display showing task IDs, titles, statuses, '
         'priorities, and dependencies. Make it look like a real CLI dashboard output.'),
        ('3. Read the latest 2 run receipts from /home/node/workspace/agents/worker/runs/ '
         'and write a formatted display to /home/node/workspace/results/demo-assets/02-run-receipts.md. '
         'Show the receipt fields in a clean terminal-style format with box-drawing characters.'),
        ('4. Read /home/node/workspace/notifications.json and write '
         '/home/node/workspace/results/demo-assets/03-whatsapp-notifications.md. '
         'Format each notification as a WhatsApp-style message bubble: '
         'timestamp | message content. Show the full notification history as if it is a WhatsApp chat.'),
        ('5. Read /home/node/workspace/agents/worker/MANDATE.md and write '
         '/home/node/workspace/results/demo-assets/04-mandate-evolution.md showing '
         'the MANDATE version history and the self-improvement story: what changed from v1.1 to v1.3 '
         'and HOW the worker updated itself (show the relevant queue tasks t004-t008 that did it).'),
        ('6. Write /home/node/workspace/results/demo-assets/00-index.md listing all demo assets '
         'with a one-line description of each and which video scene it belongs to.'),
        ('7. Append to /home/node/workspace/notifications.json: '
         'id "n-ma-screenshots", sent false, '
         'message "📸 Demo assets ready (4 screenshots + index)\nDir: /home/node/workspace/results/demo-assets/\n01-task-queue, 02-run-receipts, 03-whatsapp-notifications, 04-mandate-evolution"')
      ]
    },
    'output_path': '/home/node/workspace/results/demo-assets/00-index.md',
    'escalate_after_ms': 3600000,
    'tags': ['explainer-sprint', 'demo-assets']
  },

  {
    'id': 't-ma-slides',
    'title': 'Explainer deck slide content (15 slides)',
    'priority': 'normal',
    'type': 'self-improvement',
    'status': 'pending',
    'recurring': False,
    'created': now,
    'created_by': 'claude-code',
    'retries': 0,
    'max_retries': 2,
    'run_after': None,
    'depends_on': ['t-ma-research'],
    'locked_at': None,
    'owner': None,
    'completed_at': None,
    'error': None,
    'input': {
      'description': 'Write structured 15-slide deck content for the explainer deck.',
      'steps': [
        '1. Read /home/node/workspace/results/ma-content-brief.md',
        ('2. Write slide-by-slide content to /home/node/workspace/results/ma-slides-content.md. '
         'For each slide use this format:\n'
         '## SLIDE N: [Title]\n'
         '**Headline:** [punchy one-liner]\n'
         '**Bullets:**\n- ...\n- ...\n- ...\n'
         '**Speaker Notes:** [2-3 sentences for presenter]\n'
         '**Visual:** [what to show on this slide]\n\n'
         'Slides: '
         '1-Title (tagline: "Your AI that works while you sleep"), '
         '2-The Problem (AI assistants are reactive waiters), '
         '3-Our Architecture (3 layers, hub-and-spoke), '
         '4-Architecture Diagram (full ASCII diagram, large font), '
         '5-OpenClaw: The Runtime Fabric, '
         '6-Sherbyte: Personal AI + Real-Time Bridge, '
         '7-Background Worker: Autonomous Executor, '
         '8-Task Queue + DAG (show queue.json snippet), '
         '9-Self-Improvement Sprint (hero story: worker upgraded itself), '
         '10-!task from WhatsApp Groups, '
         '11-The Full Notification Loop, '
         '12-Production Results (0 failures, N tasks completed), '
         '13-What This Enables (proactive AI is real), '
         '14-How to Build This (OpenClaw + your agent), '
         '15-Q&A + Next Steps.'),
        ('3. Append to /home/node/workspace/notifications.json: '
         'id "n-ma-slides", sent false, '
         'message "📊 Slide content ready (15 slides)\n'
         'File: /home/node/workspace/results/ma-slides-content.md\nBuilding PPTX next..."')
      ]
    },
    'output_path': '/home/node/workspace/results/ma-slides-content.md',
    'escalate_after_ms': 3600000,
    'tags': ['explainer-sprint', 'content']
  },

  # ── BUILD (depends on content) ───────────────────────────────────────────────
  {
    'id': 't-ma-tts',
    'title': 'Generate TTS narration audio from video script',
    'priority': 'normal',
    'type': 'self-improvement',
    'status': 'pending',
    'recurring': False,
    'created': now,
    'created_by': 'claude-code',
    'retries': 0,
    'max_retries': 2,
    'run_after': None,
    'depends_on': ['t-ma-video-script'],
    'locked_at': None,
    'owner': None,
    'completed_at': None,
    'error': None,
    'input': {
      'description': 'Generate TTS audio narration from the video script using OpenAI TTS API.',
      'steps': [
        '1. Read /home/node/workspace/results/ma-video-script.md and extract the NARRATION ONLY section.',
        ('2. Write a Python script to /home/node/workspace/results/generate-tts.py that: '
         '(a) Installs openai if missing: import subprocess; subprocess.run(["pip3","install","openai","-q","--break-system-packages"]). '
         '(b) Reads the narration text from /home/node/workspace/results/ma-video-script.md (the NARRATION ONLY section). '
         '(c) Splits narration into per-scene chunks (split by "SCENE" markers). '
         '(d) For each scene chunk, calls openai.audio.speech.create(model="tts-1", voice="onyx", input=chunk) '
         'and saves to /home/node/workspace/results/tts/scene-N.mp3. '
         '(e) Also generates a full combined narration file: scene-all.mp3. '
         '(f) Creates /home/node/workspace/results/tts/ directory first. '
         'Use the OPENAI_API_KEY environment variable for auth.'),
        '3. Create directory: write /home/node/workspace/results/tts/.keep',
        '4. Execute: python3 /home/node/workspace/results/generate-tts.py',
        ('5. Append to /home/node/workspace/notifications.json: '
         'id "n-ma-tts", sent false, '
         'message "🎙️ TTS narration audio generated\nFiles: /home/node/workspace/results/tts/\nscene-1.mp3 through scene-12.mp3 + scene-all.mp3\nVoice: OpenAI onyx"')
      ]
    },
    'output_path': '/home/node/workspace/results/tts/scene-all.mp3',
    'escalate_after_ms': 3600000,
    'tags': ['explainer-sprint', 'tts']
  },

  {
    'id': 't-ma-pptx',
    'title': 'Build explainer PPTX file',
    'priority': 'normal',
    'type': 'self-improvement',
    'status': 'pending',
    'recurring': False,
    'created': now,
    'created_by': 'claude-code',
    'retries': 0,
    'max_retries': 2,
    'run_after': None,
    'depends_on': ['t-ma-slides'],
    'locked_at': None,
    'owner': None,
    'completed_at': None,
    'error': None,
    'input': {
      'description': 'Generate a PowerPoint PPTX from the slide content using python-pptx.',
      'steps': [
        '1. Read /home/node/workspace/results/ma-slides-content.md carefully — extract all 15 slides with their titles, headlines, and bullet points.',
        ('2. Write a complete Python script to /home/node/workspace/results/generate-pptx.py. '
         'The script must: '
         '(a) Install python-pptx: import subprocess; subprocess.run(["pip3","install","python-pptx","-q","--break-system-packages"]). '
         '(b) from pptx import Presentation; from pptx.util import Inches, Pt; from pptx.dml.color import RGBColor. '
         '(c) Create presentation, set slide size to widescreen (13.33 x 7.5 inches). '
         '(d) For each of the 15 slides: add a blank layout slide, set background fill to RGB(15,15,25), '
         'add title textbox at top with white text 36pt bold, '
         'add headline textbox below title with RGB(99,179,237) text 20pt italic, '
         'add bullets textbox with RGB(220,220,220) text 18pt, '
         'add slide number in bottom-right corner RGB(100,100,120) 12pt. '
         '(e) Hardcode all 15 slides content directly in the script from the slide content file. '
         '(f) prs.save("/home/node/workspace/results/ma-explainer.pptx"). '
         'Write the COMPLETE script — do not use placeholders.'),
        '3. Execute: python3 /home/node/workspace/results/generate-pptx.py',
        ('4. Append to /home/node/workspace/notifications.json: '
         'id "n-ma-pptx", sent false, '
         'media_path "/home/node/workspace/results/ma-explainer.pptx", '
         'message "📊 Explainer deck ready — 15 slides, dark theme (ma-explainer.pptx)"')
      ]
    },
    'output_path': '/home/node/workspace/results/ma-explainer.pptx',
    'escalate_after_ms': 3600000,
    'tags': ['explainer-sprint', 'build']
  },

  # ── FINAL DELIVERY ───────────────────────────────────────────────────────────
  {
    'id': 't-ma-deliver',
    'title': 'Explainer sprint — final delivery summary',
    'priority': 'urgent',
    'type': 'self-improvement',
    'status': 'pending',
    'recurring': False,
    'created': now,
    'created_by': 'claude-code',
    'retries': 0,
    'max_retries': 2,
    'run_after': None,
    'depends_on': ['t-ma-post', 't-ma-tts', 't-ma-pptx', 't-ma-screenshots'],
    'locked_at': None,
    'owner': None,
    'completed_at': None,
    'error': None,
    'input': {
      'description': 'All explainer assets complete. Send final summary to OK.',
      'steps': [
        ('1. Confirm files exist in /home/node/workspace/results/: '
         'ma-social-post.md, ma-video-script.md, ma-slides-content.md, ma-explainer.pptx, '
         'tts/ directory, demo-assets/ directory.'),
        ('2. Append to /home/node/workspace/notifications.json: '
         'id "n-ma-done", sent false, '
         'message "🚀 Explainer sprint COMPLETE!\n\n'
         'Delivered:\n'
         '✅ Social post (800w) — sent to WhatsApp above\n'
         '✅ Video script (12 scenes, demo-style) — sent above\n'
         '✅ TTS narration audio — scene-1.mp3 to scene-12.mp3 + scene-all.mp3\n'
         '✅ Slide deck (15 slides PPTX) — sent to WhatsApp above\n'
         '✅ Demo assets (task queue, run receipts, WhatsApp history, MANDATE evolution)\n\n'
         'Next steps:\n'
         '-> Post the social post on LinkedIn/X\n'
         '-> Import PPT + sync TTS audio scenes for the video\n'
         '-> Or record screen with narration using the script\n'
         '-> Demo assets in /results/demo-assets/ for video b-roll"')
      ]
    },
    'output_path': '/home/node/workspace/results/ma-deliver-summary.md',
    'escalate_after_ms': 3600000,
    'tags': ['explainer-sprint', 'delivery']
  }
]

q['tasks'].extend(new_tasks)
q['updated'] = now

with open('/home/node/workspace/task-queue/queue.json', 'w', encoding='utf-8') as f:
    json.dump(q, f, indent=2, ensure_ascii=False)

print('Queued', len(new_tasks), 'tasks:')
for t in new_tasks:
    deps = t['depends_on'] if t['depends_on'] else ['(none)']
    print(f"  {t['id']} [{t['priority']}] deps={deps}")
