# Build context is the repo root: docker build -f apps/api/Dockerfile .
FROM node:22.23.4-slim AS build
# Prisma picks its engine by the OpenSSL it finds at install, so this must match the runtime stage.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.16.1
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter api...
COPY apps/api apps/api
# Prisma 7 reads DATABASE_URL in its config even though generate never connects.
RUN DATABASE_URL=postgresql://build:build@localhost/build pnpm --dir apps/api exec prisma generate \
 && pnpm --dir apps/api build \
 && CI=true pnpm prune --prod

FROM node:22.23.4-slim
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo/apps/api
COPY --from=build --chown=node:node /repo/node_modules /repo/node_modules
COPY --from=build --chown=node:node /repo/apps/api/node_modules node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist dist
COPY --from=build --chown=node:node /repo/apps/api/prisma prisma
COPY --from=build --chown=node:node /repo/apps/api/prisma.config.ts /repo/apps/api/package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
