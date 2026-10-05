# syntax=docker/dockerfile:1
# Production image for the watch party server (API + Socket.io).
# Build from the watch-party/ directory:  docker build -t watch-party-server .

FROM node:22-bookworm-slim AS build
WORKDIR /app
# Every workspace manifest is needed for `npm ci` to validate the lockfile.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/extension/package.json apps/extension/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci -w @watch-party/shared -w @watch-party/server --include-workspace-root=false --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build -w @watch-party/shared \
 && npx -w @watch-party/server tsc -p tsconfig.build.json

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/extension/package.json apps/extension/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci -w @watch-party/shared -w @watch-party/server --include-workspace-root=false --omit=dev --ignore-scripts \
 && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/server/dist apps/server/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/server/dist/index.js"]
