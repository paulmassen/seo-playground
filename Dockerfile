# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Native build tools required by better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm ci

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Set by the release workflow. It is intentionally embedded in the client bundle
# so the running application can compare itself with published releases.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ── Stage 3: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ARG APP_VERSION=dev
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DB_PATH=/data/seo-playground.db
ENV APP_VERSION=$APP_VERSION

LABEL org.opencontainers.image.source="https://github.com/paulmassen/seo-playground"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.version=$APP_VERSION

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Standalone server bundle
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Static assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Public folder (if any)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# The standalone server does not include arbitrary project scripts; the worker only needs Node's built-in APIs.
COPY --from=builder --chown=nextjs:nodejs /app/scripts/geo-grid-worker.mjs ./scripts/geo-grid-worker.mjs
# DataForSEO locations/categories CSVs, seeded into the DB on first run (read from ./data)
COPY --from=builder --chown=nextjs:nodejs /app/data ./data

# Persistent data directory (mounted as a volume)
RUN mkdir -p /data && chown nextjs:nodejs /data

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
