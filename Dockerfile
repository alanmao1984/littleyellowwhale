# syntax=docker/dockerfile:1.7

FROM node:24.16.0-bookworm-slim AS base
# 国内 ECS 访问 registry.npmjs.org 会超时（实测 12s 无响应），而 corepack 下载 pnpm
# 和 pnpm install 都要走 registry，所以必须在 base 阶段就切换源，供后续阶段全部继承。
# 需要时可用 --build-arg NPM_REGISTRY=... 覆盖。
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_NPM_REGISTRY=$NPM_REGISTRY
ENV NPM_CONFIG_REGISTRY=$NPM_REGISTRY
RUN corepack enable && corepack prepare pnpm@10.34.3 --activate
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
ARG BUILD_SHA=unknown
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV BUILD_SHA=$BUILD_SHA
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV DATABASE_URL=postgresql://127.0.0.1:5432/build
ENV BETTER_AUTH_SECRET=build-only-secret-build-only-secret
ENV BETTER_AUTH_URL=https://xiaohuangjing.com
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN --mount=type=secret,id=next_server_actions_encryption_key \
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/next_server_actions_encryption_key)" pnpm build

FROM node:24.16.0-bookworm-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
