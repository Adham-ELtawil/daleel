# Render (free web service) / any Docker host. See docs/DEPLOY-RENDER.md.
FROM node:20-bookworm-slim

# g++ + bubblewrap for the optional local C++ runner (prlimit: util-linux, timeout: coreutils).
# If the host forbids user namespaces, scripts/render-start.sh falls back to RUNNER_PROVIDER=none.
RUN apt-get update \
  && apt-get install -y --no-install-recommends g++ bubblewrap util-linux coreutils ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Ephemeral SQLite file; recreated (migrate + seed) on every container start.
ENV NODE_ENV=production DATABASE_URL=file:/tmp/daleel/daleel.db PORT=10000
EXPOSE 10000
CMD ["sh", "scripts/render-start.sh"]
