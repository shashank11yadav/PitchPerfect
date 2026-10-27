# syntax=docker/dockerfile:1
# The web image: a standalone Next.js server. Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg API_ORIGIN=https://api.example.test -t pitchperfect-web .
# API_ORIGIN is baked in at build time: Next.js compiles the `/api` rewrite into the build, so an
# image only ever proxies to the api it was built for. Rebuild to point it somewhere else.

FROM node:22.23.4-alpine3.23 AS build
WORKDIR /repo
# Only the manifests of the workspaces this image needs. npm installs from the lockfile and skips
# workspaces that aren't present, so the api and coach dependencies stay out of the build.
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/partner/package.json packages/partner/
COPY packages/scripted-partner/package.json packages/scripted-partner/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts --no-audit --include-workspace-root \
      --workspace packages/shared --workspace packages/partner \
      --workspace packages/scripted-partner --workspace apps/web
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/partner packages/partner
COPY packages/scripted-partner packages/scripted-partner
COPY apps/web apps/web
ARG API_ORIGIN=http://api:4000
ENV API_ORIGIN=${API_ORIGIN} NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w packages/shared && npm run build -w packages/partner \
  && npm run build -w packages/scripted-partner && npm run build -w apps/web

FROM node:22.23.4-alpine3.23 AS runtime
ARG API_ORIGIN=http://api:4000
# HOSTNAME is the address the standalone server binds to; Docker sets it to the container id.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 \
    API_ORIGIN=${API_ORIGIN}
WORKDIR /app
# The standalone output mirrors the monorepo layout (outputFileTracingRoot is the repo root) and
# carries only the traced node_modules. Static assets and public/ are copied in beside it.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static apps/web/.next/static
COPY --from=build /repo/apps/web/public apps/web/public
# The app's files stay read-only to the server; only Next's runtime cache is writable.
RUN mkdir -p apps/web/.next/cache && chown node:node apps/web/.next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/" > /dev/null || exit 1
CMD ["node", "apps/web/server.js"]
