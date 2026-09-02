# syntax=docker/dockerfile:1.7
# Built from the repository root, not from apps/ai-service: the dependencies use the
# pnpm `catalog:` protocol, which only resolves against pnpm-workspace.yaml and the
# workspace lockfile. `npm install` inside an isolated context fails with
# EUNSUPPORTEDPROTOCOL.
FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PNPM_HOME/bin:$PATH"
RUN corepack enable

# *****************************************************************************
# STAGE 1: Prune the project
# *****************************************************************************
FROM base AS builder
RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app
ARG TURBO_VERSION=2.9.4
RUN corepack enable pnpm && pnpm add -g turbo@${TURBO_VERSION}
COPY . .
RUN turbo prune --scope=@plane/ai-service --docker

# *****************************************************************************
# STAGE 2: Install dependencies & build the project
# *****************************************************************************
FROM base AS installer
RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app

# First install dependencies (as they change less often)
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN corepack enable pnpm

COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked pnpm fetch --store-dir=/pnpm/store
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked CI=true pnpm install --offline --frozen-lockfile --store-dir=/pnpm/store

ENV TURBO_TELEMETRY_DISABLED=1

RUN pnpm turbo run build --filter=@plane/ai-service

# *****************************************************************************
# STAGE 3: Run the project
# *****************************************************************************
FROM base AS runner
WORKDIR /app

COPY --from=installer /app/apps/ai-service/dist ./apps/ai-service/dist
COPY --from=installer /app/apps/ai-service/node_modules ./apps/ai-service/node_modules
COPY --from=installer /app/apps/ai-service/package.json ./apps/ai-service/package.json
COPY --from=installer /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=8001
ENV TURBO_TELEMETRY_DISABLED=1

EXPOSE 8001

CMD ["node", "apps/ai-service/dist/index.js"]
