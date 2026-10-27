# syntax=docker/dockerfile:1
# The practice partner image. Build from the repository root:
#   docker build -f apps/coach/Dockerfile -t pitchperfect-coach .
# Configuration comes from the environment at run time (apps/coach/.env.example lists it).
# Never publish its port: only the api talks to it.

# Only the manifests of the workspaces this image needs. npm installs from the lockfile and skips
# workspaces that aren't present, so the api and web dependencies stay out of the image.
FROM node:22.23.4-alpine3.23 AS manifests
WORKDIR /repo
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/partner/package.json packages/partner/
COPY packages/scripted-partner/package.json packages/scripted-partner/
COPY apps/coach/package.json apps/coach/

FROM manifests AS build
RUN npm ci --ignore-scripts --no-audit --include-workspace-root \
      --workspace packages/shared --workspace packages/partner \
      --workspace packages/scripted-partner --workspace apps/coach
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/partner packages/partner
COPY packages/scripted-partner packages/scripted-partner
COPY apps/coach apps/coach
RUN npm run build -w packages/shared && npm run build -w packages/partner \
  && npm run build -w packages/scripted-partner && npm run build -w apps/coach

FROM manifests AS deps
ENV NODE_ENV=production
RUN npm ci --ignore-scripts --no-audit --omit=dev \
      --workspace packages/shared --workspace packages/partner \
      --workspace packages/scripted-partner --workspace apps/coach \
  && npm cache clean --force

FROM node:22.23.4-alpine3.23 AS runtime
# The default HOST (127.0.0.1) would be unreachable from other containers.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4100
WORKDIR /app
COPY --from=deps /repo ./
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/partner/dist packages/partner/dist
COPY --from=build /repo/packages/scripted-partner/dist packages/scripted-partner/dist
COPY --from=build /repo/apps/coach/dist apps/coach/dist
WORKDIR /app/apps/coach
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --start-interval=2s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" > /dev/null || exit 1
CMD ["node", "dist/server.js"]
