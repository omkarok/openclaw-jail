#!/bin/bash
# Runs as root. Fixes Railway volume permissions, then drops to node (uid 1000).
set -e

# Ensure all required directories exist and are owned by node user.
# Railway volumes are root-owned on first mount — this fixes that.
mkdir -p \
  /home/node/.openclaw \
  /home/node/workspace \
  /home/node/.cache \
  /var/log/openclaw

chown -R 1000:1000 /home/node /var/log/openclaw

# Drop to node user and exec the CMD (railway-start.sh).
# Explicitly set HOME so openclaw doesn't fall back to /root/.openclaw.
export HOME=/home/node
export OPENCLAW_HOME=/home/node/.openclaw
exec setpriv --reuid=1000 --regid=1000 --init-groups -- "$@"
