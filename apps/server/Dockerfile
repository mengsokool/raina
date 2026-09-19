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

RUN pnpm --filter @raina/db generate
RUN pnpm --filter @raina/workflow build
RUN pnpm --filter @raina/server build
RUN ln -sf /app/packages/db/node_modules/@prisma /app/apps/server/node_modules/@prisma

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app ./
RUN chmod +x /app/apps/server/scripts/entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["/bin/sh", "/app/apps/server/scripts/entrypoint.sh"]
CMD ["node", "apps/server/dist/index.js"]
