# Single container: the api also serves the web app. Debian's ffmpeg package
# includes libx264 / libvpx-vp9 / libwebp. Build and runtime share one base image
# so the Prisma query engine matches the runtime.
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
# Empty = local single-user mode. With a login service, build with
# --build-arg VITE_SSO_BASE=/auth (and set WHOAMI_URL for the api).
ARG VITE_SSO_BASE=
ENV VITE_SSO_BASE=${VITE_SSO_BASE}
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg openssl tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Workspace packages are consumed as TS source (loaded by tsx) and migrations
# need the prisma CLI, so the whole workspace ships with its dependencies.
COPY --from=build /app /app
RUN mkdir -p /data && chown node:node /data

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4010 \
    DATABASE_URL=file:/data/media-compress.db \
    BASE_DIR=/data/files \
    WEB_DIST_DIR=/app/web/dist \
    FFMPEG_PATH=ffmpeg \
    FFPROBE_PATH=ffprobe \
    CHECKPOINT_DISABLE=1

USER node
VOLUME /data
EXPOSE 4010
WORKDIR /app/api
ENTRYPOINT ["/usr/bin/tini", "--"]
# Apply pending migrations (no-op when up to date), then start the server.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && exec node --import tsx dist/index.js"]
