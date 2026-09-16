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
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
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

# BUILD_SHA 只在**运行期**被读取（app/api/status/route.ts 用 process.env.BUILD_SHA，
# deploy/compose.yaml 又会用 ${BLUE_SHA}/${GREEN_SHA} 注入），构建期并不需要它。
# 之前它被声明在 builder 段、且 ENV 在 RUN pnpm build 之前，导致每换一个 SHA 就让
# 那层 12 分钟的构建缓存全部失效；这台 4GB 实例曾因此在构建中 OOM 假死。
# 现在放到镜像最后一层：SHA 变化只影响这一层元数据，pnpm build 层可以跨提交复用。
ARG BUILD_SHA=unknown
ENV BUILD_SHA=$BUILD_SHA

CMD ["node", "server.js"]
