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
# Must match @openclaw/acpx's ACPX_PINNED_VERSION in
# /usr/local/lib/node_modules/openclaw/extensions/acpx/src/config.ts.
# When bumping OPENCLAW_VERSION, check that constant and bump this in lockstep.
ARG ACPX_VERSION=0.1.15

# Install openclaw globally during build (required for read-only root at runtime)
RUN corepack enable && npm install -g openclaw@${OPENCLAW_VERSION}

# Pre-bake the ACP runtime backend (acpx) into the @openclaw/acpx extension's
# node_modules. The extension's runtime ensureAcpx() would otherwise run
# `npm install acpx@<pinned>` on first ACP session spawn, which fails under
# read_only:true root FS + uid 1000 user with EACCES on
# /usr/local/lib/node_modules/openclaw/extensions/acpx/node_modules.
# Installing the exact ACPX_PINNED_VERSION here makes the runtime precheck
# pass and skip the install entirely.
RUN cd /usr/local/lib/node_modules/openclaw/extensions/acpx \
 && npm install --omit=dev --no-save acpx@${ACPX_VERSION} \
 && ./node_modules/.bin/acpx --version

# Install Playwright Chromium system dependencies
# Browser binaries live in the home bind-mount (~/.cache/ms-playwright) so we
# only need the OS-level shared libraries baked into the image.
RUN npm install -g playwright@${PLAYWRIGHT_VERSION} --ignore-scripts && playwright install-deps chromium

# Create log directory owned by node user (uid 1000)
RUN mkdir -p /var/log/openclaw && chown node:node /var/log/openclaw

# Switch to non-root node user (uid 1000, gid 1000)
USER node
WORKDIR /home/node
