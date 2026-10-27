# syntax=docker/dockerfile:1
# The api image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t pitchperfect-api .
# Configuration comes from the environment at run time (apps/api/.env.example lists it).

# Only the manifests of the workspaces this image needs. npm installs from the lockfile and skips
# workspaces that aren't present, so the coach and web dependencies stay out of the image.
FROM node:22.23.4-alpine3.23 AS manifests
WORKDIR /repo
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

FROM manifests AS build
# Install scripts stay off: argon2 ships prebuilt musl binaries, and nothing else is needed to compile.
RUN npm ci --ignore-scripts --no-audit --include-workspace-root \
      --workspace packages/shared --workspace apps/api
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w packages/shared && npm run build -w apps/api

FROM manifests AS deps
ENV NODE_ENV=production
RUN npm ci --ignore-scripts --no-audit --omit=dev \
      --workspace packages/shared --workspace apps/api \
  && npm cache clean --force

FROM node:22.23.4-alpine3.23 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /repo ./
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-4000}/api/health" > /dev/null || exit 1
# Admin, purge, and seed run from the same image: `node dist/scripts/<admin|purge-expired|seed>.js`.
CMD ["node", "dist/server.js"]
