# 单容器部署：api 同时托管前端，镜像内置 Debian 官方 ffmpeg（含 libx264 / libvpx-vp9 / libwebp）。
# 构建与运行用同一个基础镜像，Prisma 生成的查询引擎与运行环境一致。
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
# 留空 = 本地单用户模式；接入登录服务时构建参数传 VITE_SSO_BASE=/auth（api 另设 WHOAMI_URL）
ARG VITE_SSO_BASE=
ENV VITE_SSO_BASE=${VITE_SSO_BASE}
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg openssl tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# 内部包以 TS 源码被引用、运行时靠 tsx 加载，迁移要用 prisma CLI，所以整个工作区连同依赖一起带上。
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
# 每次启动先应用数据库迁移（已是最新时什么也不做），再启动服务。
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && exec node --import tsx dist/index.js"]
