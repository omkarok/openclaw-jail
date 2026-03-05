# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

## OpenClaw Commands

### Send a WhatsApp message to OK (outgoing DM)
```bash
MSYS_NO_PATHCONV=1 docker exec openclaw openclaw message send \
  --channel whatsapp --target +919892787587 --message "your message"
```
**NOT** `openclaw agent --to` — that routes through Sherbyte as an inbound relay, does NOT deliver a WhatsApp DM.

### Send a file/media to OK on WhatsApp
```bash
MSYS_NO_PATHCONV=1 docker exec openclaw openclaw message send \
  --channel whatsapp --target +919892787587 --media /home/node/workspace/path/to/file
```

### Trigger background worker immediately
```bash
docker exec openclaw openclaw cron run a9a8cc75-d136-4fc9-830f-0ae13cd628b1
```

### Send message to Sherbyte (relay / inbound simulation)
```bash
MSYS_NO_PATHCONV=1 docker exec openclaw openclaw agent --to +919892787587 --message "..."
```
Use this only to give Sherbyte instructions — not to send WhatsApp messages to OK.

Add whatever helps you do your job. This is your cheat sheet.
