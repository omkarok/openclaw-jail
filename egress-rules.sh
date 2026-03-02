#!/bin/bash
# egress-rules.sh — Apply host-side network egress restrictions for the openclaw container.
#
# Applied to the DOCKER-USER iptables chain in WSL2 Ubuntu.
# Docker preserves this chain across container restarts; rules survive
# as long as the WSL2 session is running.
#
# Run as root: sudo bash egress-rules.sh
# Persisted by: openclaw-egress.service (systemd, WSL2 Ubuntu)
#
# What this enforces (outbound from the container subnet):
#   BLOCK  — cloud metadata endpoints (169.254.x.x)
#   BLOCK  — all non-standard ports (C2 channels, raw TCP exfiltration)
#   ALLOW  — established/related response packets
#   ALLOW  — intra-Docker traffic (container ↔ gateway)
#   ALLOW  — DNS (53/udp+tcp)
#   ALLOW  — HTTPS (443/tcp) — OpenAI API, WhatsApp Web, browser automation
#   ALLOW  — HTTP  (80/tcp)  — browser automation, redirects
#   ALLOW  — NTP   (123/udp) — time sync
#   DROP   — everything else

set -euo pipefail

# ── Detect openclaw network subnet ───────────────────────────────────────────
SUBNET=$(docker network inspect openclaw-jail_default \
  --format '{{(index .IPAM.Config 0).Subnet}}' 2>/dev/null || true)

if [[ -z "$SUBNET" ]]; then
  echo "ERROR: openclaw-jail_default network not found. Start the container first."
  exit 1
fi

echo "[egress] openclaw subnet: $SUBNET"

# ── Flush previous openclaw rules from DOCKER-USER (idempotent re-runs) ─────
# Use iptables -S (save format, no DNS lookup) to find and delete existing rules
while iptables -D DOCKER-USER -s "$SUBNET" -d 169.254.169.254/32 -j DROP 2>/dev/null; do :; done
while iptables -D DOCKER-USER -s "$SUBNET" -d 169.254.170.2/32   -j DROP 2>/dev/null; do :; done
while iptables -D DOCKER-USER -s "$SUBNET" -d "$SUBNET"           -j RETURN 2>/dev/null; do :; done
while iptables -D DOCKER-USER -s "$SUBNET" -p udp --dport 53      -j RETURN 2>/dev/null; do :; done
while iptables -D DOCKER-USER -s "$SUBNET" -p tcp --dport 53      -j RETURN 2>/dev/null; do :; done
while iptables -D DOCKER-USER -s "$SUBNET" -p tcp --dport 443     -j RETURN 2>/dev/null; do :; done
while iptables -D DOCKER-USER -s "$SUBNET" -p tcp --dport 80      -j RETURN 2>/dev/null; do :; done
while iptables -D DOCKER-USER -s "$SUBNET" -p udp --dport 123     -j RETURN 2>/dev/null; do :; done
while iptables -D DOCKER-USER -s "$SUBNET"                        -j DROP   2>/dev/null; do :; done
# Also clear conntrack rule (inserted at pos 1)
while iptables -D DOCKER-USER -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN 2>/dev/null; do :; done

echo "[egress] Cleared previous rules."

# ── Apply egress rules ────────────────────────────────────────────────────────

# 1. Allow established/related (response packets for already-allowed connections)
iptables -I DOCKER-USER 1 -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN

# 2. Block cloud metadata endpoints (BEFORE any ALLOW rules)
iptables -I DOCKER-USER 2 -s "$SUBNET" -d 169.254.169.254/32 -j DROP  # AWS/GCP/Azure IMDS
iptables -I DOCKER-USER 3 -s "$SUBNET" -d 169.254.170.2/32   -j DROP  # AWS ECS task metadata

# 3. Allow intra-Docker traffic (container ↔ Docker gateway, inter-container)
iptables -A DOCKER-USER -s "$SUBNET" -d "$SUBNET" -j RETURN

# 4. Allow DNS (needed for OpenAI / WhatsApp hostname resolution)
iptables -A DOCKER-USER -s "$SUBNET" -p udp --dport 53 -j RETURN
iptables -A DOCKER-USER -s "$SUBNET" -p tcp --dport 53 -j RETURN

# 5. Allow standard web ports
#    443: OpenAI API, WhatsApp Baileys, browser automation (HTTPS)
#    80:  browser automation (HTTP), redirects
iptables -A DOCKER-USER -s "$SUBNET" -p tcp --dport 443 -j RETURN
iptables -A DOCKER-USER -s "$SUBNET" -p tcp --dport 80  -j RETURN

# 6. Allow NTP (time sync)
iptables -A DOCKER-USER -s "$SUBNET" -p udp --dport 123 -j RETURN

# 7. DROP everything else from container subnet
#    Blocks: raw TCP C2, SMTP (25/587), IRC (6667), non-standard exfiltration ports,
#    any protocol the agent might use outside of standard web traffic
iptables -A DOCKER-USER -s "$SUBNET" -j DROP

echo "[egress] Rules applied for $SUBNET:"
echo "  BLOCK  169.254.169.254, 169.254.170.2 (cloud metadata)"
echo "  ALLOW  established/related, intra-Docker, DNS(53), HTTPS(443), HTTP(80), NTP(123)"
echo "  DROP   all other outbound"
echo ""

# Show current rules (use -S to avoid DNS-lookup hang in WSL2)
echo "Current DOCKER-USER chain:"
iptables -S DOCKER-USER
