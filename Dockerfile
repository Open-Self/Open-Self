# syntax=docker/dockerfile:1

# OpenSelf — user-owned context layer for AI agents.
# Local-first: the vault lives in a mounted volume at /data, nothing leaves
# the container unless you configure a remote embedding provider yourself.

FROM node:22-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 ships prebuilt binaries for node22/glibc; the toolchain is
# only a fallback for architectures without prebuilds.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm rebuild better-sqlite3

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    DATA_DIR=/data

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.json ./
COPY src ./src
COPY skills ./skills
COPY spec ./spec
COPY docs ./docs
COPY README.md LICENSE ./

# Run unprivileged; the vault volume must be writable by this uid.
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]

# stdio MCP server by default. For the HTTP transport:
#   docker run -p 3211:3211 ghcr.io/open-self/openself mcp --http --port 3211
ENTRYPOINT ["node", "src/cli/index.js"]
CMD ["mcp"]

LABEL org.opencontainers.image.title="OpenSelf" \
      org.opencontainers.image.description="The user-owned context layer for AI agents" \
      org.opencontainers.image.source="https://github.com/Open-Self/Open-Self" \
      org.opencontainers.image.licenses="MIT"
