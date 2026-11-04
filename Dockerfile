# Daleel — runs on any OS with Docker (Linux, macOS, Windows).
# Includes g++ and bubblewrap so the C++ sandbox (RUNNER_PROVIDER=local) works inside the container.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends g++ bubblewrap util-linux coreutils ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack prepare pnpm@10.34.6 --activate && pnpm install --frozen-lockfile

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Production build validates SESSION_SECRET; use a throwaway one here (the runtime secret is set by the entrypoint).
RUN SESSION_SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))") pnpm build \
 && mkdir -p data && chown -R node:node /app/data /app/.next

# Defaults: zero-key recorded demo, no sandbox. Override with -e or docker-compose.yml.
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/app/data/daleel.db \
    DEMO_REPLAY=1 \
    RUNNER_PROVIDER=none

# bwrap runs as an unprivileged user inside its own namespaces.
USER node
EXPOSE 3000
ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
