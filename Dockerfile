# syntax=docker/dockerfile:1
#
# Multi-stage build for the RAIS / MO!D on-prem appliance.
# The proprietary source (src/) exists ONLY in the `builder` stage and is
# discarded. The final `runner` image contains only the minified, bundled
# Next.js standalone server — no TypeScript, no source tree, no package.json
# scripts. See docs/DEPLOYMENT.md ("Source protection").

# ---- 1. deps: install production+build deps against a lockfile -----------------
FROM node:24-alpine AS deps
WORKDIR /app
# libc compat for any native deps (e.g. pg's optional bindings)
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci

# ---- 2. builder: compile the app, emit the standalone bundle -------------------
FROM node:24-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Produces .next/standalone (server.js + traced node_modules) and .next/static
RUN npm run build

# ---- 3. runner: the shippable image (no source) -------------------------------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as an unprivileged user
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copy ONLY the standalone server + static assets + public dir.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# Standalone entrypoint emitted by Next.
CMD ["node", "server.js"]
