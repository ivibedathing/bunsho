# Bunsho — single self-contained image serving UI + API (PRD §8).
# Multi-stage build producing a Next.js standalone server.

# ---- Base: pnpm on Node 26 (debian slim; openssl for Prisma engine detection) ----
# Pinned by digest so a rebuild is reproducible; Dependabot moves the digest.
FROM node:26-bookworm-slim@sha256:2d49d876e96237d76de412761cf05dbfe5aee325cc4406a4d41d5824c5bb8beb AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
# Node 25 dropped bundled corepack, so pnpm is installed from npm instead.
# Keep this version in step with `packageManager` in package.json.
RUN npm install -g pnpm@10.29.2
WORKDIR /app

# ---- Dependencies (no lifecycle scripts; Prisma generates in the build stage) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# ---- Build: generate Prisma client + compile Next.js ----
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate
RUN pnpm build

# ---- Runner: minimal standalone runtime ----
FROM node:26-bookworm-slim@sha256:2d49d876e96237d76de412761cf05dbfe5aee325cc4406a4d41d5824c5bb8beb AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# Unprivileged user to run as. (openssl was here for the Prisma query engine;
# Prisma 7 dropped the Rust engine, so it is now vestigial — left in place to
# keep this change to the dependency fix, but it can go.)
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone server bundle + static assets.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma generated client. Copied explicitly because it lives outside
# node_modules, where the Next.js tracer doesn't always follow it.
COPY --from=builder --chown=nextjs:nodejs /app/src/generated/prisma ./src/generated/prisma

# Migrations + schema so `prisma migrate deploy` can run on startup / release.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs
EXPOSE 3000

# Liveness probe target: GET /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
