FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS builder
WORKDIR /app

# Copy dependency manifests first to leverage Docker layer caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/workflow/package.json ./packages/workflow/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

# Install dependencies with BuildKit cache mount for pnpm store
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source code after dependencies are installed
COPY packages ./packages
COPY apps/server ./apps/server
COPY apps/web ./apps/web

ARG INTERNAL_API_URL=http://localhost:3001
ARG VITE_WS_URL
ENV INTERNAL_API_URL=${INTERNAL_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}

RUN pnpm --filter @raina/db generate
RUN pnpm --filter @raina/workflow build
RUN pnpm --filter @raina/server build
RUN pnpm --filter @raina/web build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV INTERNAL_API_URL=http://server:3001

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/apps/web/build ./apps/web/build

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["node", "./node_modules/@react-router/serve/dist/cli.js", "build/server/index.js"]
