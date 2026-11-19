# Build context is the repo root: docker build -f apps/api/Dockerfile .
FROM node:22.23.4-slim AS build
# Prisma picks its engine by the OpenSSL it finds at install, so this must match the runtime stage.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.16.1
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/master-profile/package.json packages/master-profile/
COPY packages/resume-render/package.json packages/resume-render/
RUN pnpm install --frozen-lockfile --filter api...
COPY packages/master-profile packages/master-profile
COPY packages/resume-render packages/resume-render
COPY apps/api apps/api
COPY config config
# Prisma 7 reads DATABASE_URL in its config even though generate never connects.
RUN DATABASE_URL=postgresql://build:build@localhost/build pnpm --dir apps/api exec prisma generate \
 && pnpm --dir packages/master-profile build \
 && pnpm --dir packages/resume-render build \
 && pnpm --dir apps/api build \
 && CI=true pnpm prune --prod

FROM node:22.23.4-slim
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo/apps/api
COPY --from=build --chown=node:node /repo/node_modules /repo/node_modules
COPY --from=build --chown=node:node /repo/packages/master-profile/node_modules /repo/packages/master-profile/node_modules
COPY --from=build --chown=node:node /repo/packages/master-profile/dist /repo/packages/master-profile/dist
COPY --from=build --chown=node:node /repo/packages/master-profile/package.json /repo/packages/master-profile/package.json
COPY --from=build --chown=node:node /repo/packages/resume-render/node_modules /repo/packages/resume-render/node_modules
COPY --from=build --chown=node:node /repo/packages/resume-render/dist /repo/packages/resume-render/dist
# The renderer reads its templates, fonts and pinned Typst version from the package folder, beside dist/.
# The Typst binary is not here yet (#42), so Approve answers 500 on the server until it is.
COPY --from=build --chown=node:node /repo/packages/resume-render/src/resume.typ /repo/packages/resume-render/src/letter.typ /repo/packages/resume-render/src/
COPY --from=build --chown=node:node /repo/packages/resume-render/fonts /repo/packages/resume-render/fonts
COPY --from=build --chown=node:node /repo/packages/resume-render/typst-version /repo/packages/resume-render/package.json /repo/packages/resume-render/
COPY --from=build --chown=node:node /repo/apps/api/node_modules node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist dist
# The feed's "Why" reads the tier config at ../../config from here.
COPY --from=build --chown=node:node /repo/config /repo/config
COPY --from=build --chown=node:node /repo/apps/api/prisma prisma
COPY --from=build --chown=node:node /repo/apps/api/prisma.config.ts /repo/apps/api/package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
