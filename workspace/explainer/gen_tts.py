"""
gen_tts.py — Generate TTS audio for each explainer video slide.
Run: python3 /mnt/c/Users/mentoria/openclaw-jail/workspace/explainer/gen_tts.py
"""
import asyncio, json, subprocess, os, sys
import edge_tts

VOICE = "en-US-GuyNeural"
OUT_DIR = "/mnt/c/Users/mentoria/openclaw-jail/workspace/explainer/audio"

SCRIPTS = {
    "01_title": (
        "Meet OpenClaw. A hardened AI agent runtime that bridges multiple AI systems "
        "inside a secure Docker jail — built for production, designed for control."
    ),
    "02_problem": (
        "Most AI deployments are fragile: single model, single channel, no guardrails. "
        "OpenClaw changes that. Run any AI model, on any messaging platform, "
        "with enterprise-grade security baked in from day one."
    ),
    "03_architecture": (
        "Here's the big picture. WhatsApp is your interface. "
        "G P T 5.3, codenamed Sherbyte, is the brain. "
        "Claude Code — Anthropic's AI — is the ops layer. "
        "OpenClaw sits in the middle, routing everything through a single hardened gateway."
    ),
    "04_dash_chat": (
        "This is the live OpenClaw gateway dashboard. "
        "The Chat view shows real conversations flowing through the system in real time — "
        "every message in, every agent reply out, fully logged."
    ),
    "05_dash_channels": (
        "The Channels panel shows every connected platform. "
        "Here, WhatsApp is active and linked — locked down to a single authorized number "
        "via the allow-from policy. No one else can reach the agent."
    ),
    "06_dash_agents": (
        "The Agents panel shows the active AI instance. "
        "GPT 5.3 Codex is running with workspace access, "
        "memory compaction in safeguard mode, and up to four concurrent tasks. "
        "The Nodes panel lists every tool available — "
        "39 browser commands, file operations, and system utilities — "
        "all controllable from the dashboard."
    ),
    "07_security": (
        "The Docker jail is the security core. "
        "Read-only root filesystem. All Linux capabilities dropped. "
        "Non-root user. No privilege escalation possible. "
        "Only the workspace volume is writable — everything else is locked at image build time."
    ),
    "08_egress": (
        "At the network level, WSL 2 kernel rules enforce strict egress. "
        "Only DNS, HTTP, HTTPS, and NTP are allowed out. "
        "Every other port is dropped. The cloud metadata endpoint is unreachable. "
        "This brings the setup to a security score of 9 out of 10."
    ),
    "09_multiagent": (
        "The multi-agent orchestration is the real power move. "
        "Claude Code sends a command: openclaw agent, dash dash message. "
        "Sherbyte processes it and replies. "
        "Add dash dash deliver, and the reply also lands on WhatsApp. "
        "Three AI systems, one coherent workflow, zero manual glue."
    ),
    "10_closing": (
        "Secure. Flexible. Multi-agent. "
        "OpenClaw — a production-grade AI agent jail "
        "built with real hardening, real observability, and real multi-model orchestration. "
        "Score: 9 out of 10."
    ),
}

async def gen(slide_id, text, out_dir):
    path = os.path.join(out_dir, f"{slide_id}.mp3")
    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(path)
    return path

def get_duration(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "json", path],
        capture_output=True, text=True
    )
    return float(json.loads(result.stdout)["format"]["duration"])

async def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    durations = {}
    for slide_id, text in SCRIPTS.items():
        print(f"Generating {slide_id}...", end=" ", flush=True)
        path = await gen(slide_id, text, OUT_DIR)
        dur = get_duration(path)
        durations[slide_id] = round(dur, 3)
        print(f"{dur:.1f}s")

    meta_path = os.path.join(OUT_DIR, "durations.json")
    with open(meta_path, "w") as f:
        json.dump(durations, f, indent=2)
    print(f"\nDurations saved to {meta_path}")
    print(json.dumps(durations, indent=2))

asyncio.run(main())
