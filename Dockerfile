# Pin base image to exact version tag to prevent silent upstream drift.
# To update: check https://hub.docker.com/_/node/tags and bump both tag + comment.
# Full digest pin (node:22.22.0-bookworm@sha256:...) gives stronger guarantees
# but blocks auto-reception of base-image security patches — acceptable trade-off
# for a personal deployment; revisit for production multi-tenant use.
FROM node:22.22.0-bookworm

# Pin package versions — never use @latest in a security-sensitive build.
# To upgrade: test the new version, then bump both pins here.
ARG OPENCLAW_VERSION=2026.3.2
ARG PLAYWRIGHT_VERSION=1.58.2

# Install openclaw globally during build (required for read-only root at runtime)
RUN corepack enable && npm install -g openclaw@${OPENCLAW_VERSION}

# Install Playwright Chromium system dependencies
# Browser binaries live in the home bind-mount (~/.cache/ms-playwright) so we
# only need the OS-level shared libraries baked into the image.
RUN npm install -g playwright@${PLAYWRIGHT_VERSION} --ignore-scripts && playwright install-deps chromium

# Create log directory owned by node user (uid 1000)
RUN mkdir -p /var/log/openclaw && chown node:node /var/log/openclaw

# Copy entrypoint script (before switching to non-root user)
COPY entrypoint.sh /usr/local/bin/entrypoint.sh

# Switch to non-root node user (uid 1000, gid 1000)
USER node
WORKDIR /home/node

# Railway assigns a dynamic PORT; default to 18789 for local use
ENV PORT=18789
EXPOSE ${PORT}

CMD ["bash", "/usr/local/bin/entrypoint.sh"]
