"""
generate-tts-host.py
Generates per-scene MP3 narration files using Edge TTS (en-US-GuyNeural).
Run on host (Windows), output goes to workspace/results/tts/ for container assembly.
Usage: python generate-tts-host.py <script-path> <output-dir>
"""
import sys, os, re, asyncio
import edge_tts

VOICE = "en-US-GuyNeural"
RATE  = "-5%"
PITCH = "-5Hz"

def parse_narrations(script_path):
    with open(script_path, encoding='utf-8') as f:
        content = f.read()
    blocks = re.split(r'^## SCENE \d+:', content, flags=re.MULTILINE)[1:]
    scenes = []
    for block in blocks:
        m = re.search(r'\*\*Narration:\*\*\s*([\s\S]+?)(?=\*\*Duration:|$)', block)
        narration = m.group(1).strip() if m else ''
        scenes.append(narration)
    return scenes

async def gen_one(text, out_path, idx, total):
    if not text.strip():
        print(f"  [{idx+1}/{total}] SKIP (empty)")
        return
    communicate = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH)
    await communicate.save(out_path)
    size = os.path.getsize(out_path)
    print(f"  [{idx+1}/{total}] {size//1024}KB -> {os.path.basename(out_path)}")

async def main():
    script_path = sys.argv[1]
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)

    narrations = parse_narrations(script_path)
    print(f"Generating TTS for {len(narrations)} scenes (voice: {VOICE})...")

    tasks = []
    for i, narration in enumerate(narrations):
        out_path = os.path.join(out_dir, f"scene-{i:03d}.mp3")
        tasks.append(gen_one(narration, out_path, i, len(narrations)))

    # Run concurrently (Edge TTS handles this fine)
    await asyncio.gather(*tasks)
    print(f"\nDone. Audio files in: {out_dir}")

asyncio.run(main())
