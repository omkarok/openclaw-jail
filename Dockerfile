FROM node:22-bookworm

# Install openclaw globally during build (required for read-only root at runtime)
RUN corepack enable && npm install -g openclaw@latest

# Install Playwright Chromium system dependencies
# Browser binaries live in the home bind-mount (~/.cache/ms-playwright) so we
# only need the OS-level shared libraries baked into the image.
RUN npm install -g playwright --ignore-scripts && playwright install-deps chromium

# Create log directory owned by node user (uid 1000)
RUN mkdir -p /var/log/openclaw && chown node:node /var/log/openclaw

# Switch to non-root node user (uid 1000, gid 1000)
USER node
WORKDIR /home/node
