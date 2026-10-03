FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.19.0
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @lc-play/api... --filter @lc-play/admin-web...
COPY packages/contracts packages/contracts
COPY apps/api apps/api
COPY apps/admin-web apps/admin-web
RUN pnpm --filter @lc-play/contracts build
RUN pnpm --filter @lc-play/api prisma:generate
RUN pnpm --filter @lc-play/api build

FROM base AS api
COPY --from=build --chown=node:node /app /app
ENV NODE_ENV=production API_PORT=4100
USER node
EXPOSE 4100
CMD ["node", "apps/api/dist/main.js"]

FROM build AS admin-build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @lc-play/admin-web build

FROM node:24-bookworm-slim AS admin
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=admin-build --chown=node:node /app/apps/admin-web/.next/standalone ./
COPY --from=admin-build --chown=node:node /app/apps/admin-web/.next/static ./apps/admin-web/.next/static
COPY --from=admin-build --chown=node:node /app/apps/admin-web/public ./apps/admin-web/public
USER node
EXPOSE 3000
CMD ["node", "apps/admin-web/server.js"]
