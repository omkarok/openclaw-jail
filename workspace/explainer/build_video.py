"""
build_video.py — Assemble the OpenClaw explainer video.
  - TTS narration per slide
  - Real dashboard screenshots + architecture slides
  - Ken Burns zoom + fade transitions
  - Captions/subtitles at bottom

Run: python3 /mnt/c/Users/mentoria/openclaw-jail/workspace/explainer/build_video.py
"""
import json, os, subprocess, shutil, math, textwrap

BASE = "/mnt/c/Users/mentoria/openclaw-jail/workspace/explainer"
AUDIO_DIR = f"{BASE}/audio"
FRAMES_DIR = f"{BASE}/frames"
SEGMENTS_DIR = f"{BASE}/segments"
OUT_MP4 = f"{BASE}/openclaw_explainer_v2.mp4"

# slide_id → (image_path, caption_text)
SLIDES = [
    ("01_title",    f"{FRAMES_DIR}/slide_01.png",
     "OpenClaw — Hardened AI Agent Jail"),
    ("02_problem",  f"{FRAMES_DIR}/slide_09.png",
     "Why OpenClaw? Secure • Multi-Model • Multi-Channel"),
    ("03_arch",     f"{FRAMES_DIR}/slide_02.png",
     "Architecture: Claude Code ↔ OpenClaw Gateway ↔ GPT-5.3"),
    ("04_dash_chat",f"{BASE}/dash_chat.png",
     "LIVE DASHBOARD — Chat Interface"),
    ("05_dash_ch",  f"{BASE}/dash_channels.png",
     "LIVE DASHBOARD — Channels: WhatsApp Connected"),
    ("06_dash_ag",  f"{BASE}/dash_agents.png",
     "LIVE DASHBOARD — Agents & Available Nodes/Tools"),
    ("07_security", f"{FRAMES_DIR}/slide_03.png",
     "Docker Jail: Read-Only FS • Dropped Caps • Non-Root"),
    ("08_egress",   f"{FRAMES_DIR}/slide_05.png",
     "Network Egress: DOCKER-USER Chain • Score 9/10"),
    ("09_multi",    f"{FRAMES_DIR}/slide_08.png",
     "Multi-Agent Orchestration: 3-Way AI Pipeline"),
    ("10_closing",  f"{FRAMES_DIR}/slide_10.png",
     "Secure · Flexible · Multi-Agent — OpenClaw"),
]

# Narration scripts (for SRT subtitle generation)
SCRIPTS = {
    "01_title":    "Meet OpenClaw. A hardened AI agent runtime that bridges multiple AI systems inside a secure Docker jail — built for production, designed for control.",
    "02_problem":  "Most AI deployments are fragile: single model, single channel, no guardrails. OpenClaw changes that. Run any AI model, on any messaging platform, with enterprise-grade security baked in from day one.",
    "03_arch":     "Here's the big picture. WhatsApp is your interface. GPT 5.3, codenamed Sherbyte, is the brain. Claude Code — Anthropic's AI — is the ops layer. OpenClaw sits in the middle, routing everything through a single hardened gateway.",
    "04_dash_chat":"This is the live OpenClaw gateway dashboard. The Chat view shows real conversations flowing through the system in real time — every message in, every agent reply out, fully logged.",
    "05_dash_ch":  "The Channels panel shows every connected platform. Here, WhatsApp is active and linked — locked down to a single authorized number via the allow-from policy. No one else can reach the agent.",
    "06_dash_ag":  "The Agents panel shows the active AI instance. GPT 5.3 Codex is running with workspace access, memory compaction in safeguard mode, and up to four concurrent tasks. The Nodes panel lists every tool available — 39 browser commands, file operations, and system utilities — all controllable from the dashboard.",
    "07_security": "The Docker jail is the security core. Read-only root filesystem. All Linux capabilities dropped. Non-root user. No privilege escalation possible. Only the workspace volume is writable — everything else is locked at image build time.",
    "08_egress":   "At the network level, WSL 2 kernel rules enforce strict egress. Only DNS, HTTP, HTTPS, and NTP are allowed out. Every other port is dropped. The cloud metadata endpoint is unreachable. This brings the setup to a security score of 9 out of 10.",
    "09_multi":    "The multi-agent orchestration is the real power move. Claude Code sends a command: openclaw agent dash dash message. Sherbyte processes it and replies. Add dash dash deliver, and the reply also lands on WhatsApp. Three AI systems, one coherent workflow, zero manual glue.",
    "10_closing":  "Secure. Flexible. Multi-agent. OpenClaw — a production-grade AI agent jail built with real hardening, real observability, and real multi-model orchestration. Score: 9 out of 10.",
}

def run(cmd, **kw):
    print("  $", " ".join(str(c) for c in cmd))
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        print("  STDERR:", r.stderr[-500:])
        raise RuntimeError(f"Command failed: {r.returncode}")
    return r

def get_duration(path):
    r = subprocess.run(
        ["ffprobe","-v","error","-show_entries","format=duration","-of","json", path],
        capture_output=True, text=True
    )
    return float(json.loads(r.stdout)["format"]["duration"])

def wrap_caption(text, width=80):
    """Wrap caption text for ffmpeg drawtext."""
    return "\n".join(textwrap.wrap(text, width))

def escape_drawtext(s):
    """Escape string for ffmpeg drawtext."""
    return s.replace("'", "\\'").replace(":", "\\:").replace("\\", "\\\\")

def build_segment(slide_id, img_path, audio_path, caption, duration, out_path):
    """Build one video segment: image + audio + caption overlay + ken burns zoom + fades."""
    dur = duration + 0.4   # tiny tail padding
    frames = math.ceil(dur * 24)
    fade_dur = 0.4
    fade_out_start = max(0, dur - fade_dur)

    # Caption - two lines max, centered bottom strip
    cap = escape_drawtext(caption)

    vf = (
        # Scale image to slightly larger for zoom headroom
        f"scale=1960:1102:flags=lanczos,"
        # Ken Burns: slow zoom from center
        f"zoompan=z='min(zoom+0.0003,1.04)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s=1920x1080:fps=24,"
        # Dark bottom bar for caption
        f"drawbox=x=0:y=980:w=1920:h=100:color=black@0.65:t=fill,"
        # Caption text
        f"drawtext=text='{cap}':fontcolor=white:fontsize=30:x=(w-text_w)/2:y=990:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:shadowcolor=black:shadowx=2:shadowy=2,"
        # Fade in
        f"fade=t=in:st=0:d={fade_dur},"
        # Fade out
        f"fade=t=out:st={fade_out_start:.3f}:d={fade_dur}"
    )

    run([
        "ffmpeg", "-y",
        "-loop", "1", "-framerate", "24", "-i", img_path,
        "-i", audio_path,
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-c:a", "aac", "-b:a", "128k",
        "-pix_fmt", "yuv420p",
        "-t", str(dur),
        "-shortest",
        out_path
    ])

def build_srt(slides_with_durations):
    """Build SRT subtitle file."""
    srt_lines = []
    t = 0.0
    for i, (slide_id, _, _, _) in enumerate(slides_with_durations, 1):
        dur = slides_with_durations[i-1][3]
        script = SCRIPTS.get(slide_id, "")
        # Chunk script into ~5s segments
        words = script.split()
        chunk_size = max(1, len(words) // max(1, round(dur / 5)))
        chunks = [words[j:j+chunk_size] for j in range(0, len(words), chunk_size)]
        chunk_dur = dur / len(chunks)
        for k, chunk in enumerate(chunks):
            start = t + k * chunk_dur
            end = start + chunk_dur - 0.1
            srt_lines.append(f"{i*100+k}")
            srt_lines.append(f"{fmt_srt(start)} --> {fmt_srt(end)}")
            srt_lines.append(" ".join(chunk))
            srt_lines.append("")
        t += dur
    return "\n".join(srt_lines)

def fmt_srt(s):
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = s % 60
    return f"{h:02d}:{m:02d}:{sec:06.3f}".replace(".", ",")

def main():
    os.makedirs(SEGMENTS_DIR, exist_ok=True)

    # Load durations
    with open(f"{AUDIO_DIR}/durations.json") as f:
        durations = json.load(f)

    # Remap duration keys to slide_id (they may differ slightly)
    dur_map = {}
    for (sid, _, _), (key, _) in zip(SLIDES, [
        ("01_title",None),("02_problem",None),("03_architecture",None),
        ("04_dash_chat",None),("05_dash_channels",None),("06_dash_agents",None),
        ("07_security",None),("08_egress",None),("09_multiagent",None),("10_closing",None)
    ]):
        dur_map[sid] = durations[key]

    slides_with_dur = [(sid, img, cap, dur_map[sid]) for sid, img, cap in SLIDES]

    # Build segments
    segment_paths = []
    for i, (sid, img, cap, dur) in enumerate(slides_with_dur, 1):
        audio = f"{AUDIO_DIR}/{list(durations.keys())[i-1]}.mp3"
        seg_path = f"{SEGMENTS_DIR}/seg_{i:02d}_{sid}.mp4"
        print(f"\n[{i}/10] Building segment: {sid} ({dur:.1f}s)")
        build_segment(sid, img, audio, cap, dur, seg_path)
        segment_paths.append(seg_path)

    # Concatenate
    print("\n[Concat] Joining all segments...")
    concat_list = f"{SEGMENTS_DIR}/concat.txt"
    with open(concat_list, "w") as f:
        for p in segment_paths:
            f.write(f"file '{p}'\n")

    run([
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", concat_list,
        "-c:v", "libx264", "-preset", "slow", "-crf", "18",
        "-c:a", "aac", "-b:a", "128k",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        OUT_MP4
    ])

    dur = get_duration(OUT_MP4)
    size = os.path.getsize(OUT_MP4) / 1024 / 1024
    print(f"\nDone: {OUT_MP4}")
    print(f"  Duration: {dur:.1f}s  Size: {size:.1f}MB")

main()
