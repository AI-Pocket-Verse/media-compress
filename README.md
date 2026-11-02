# media-compress

自托管的图片 / 视频压缩与去水印工具，基于 FFmpeg。上传文件后在服务端排队处理，可对比压缩前后效果、批量打包下载。

- **压缩**：简单模式（APP / 均衡 / 最小体积 / 高画质四档预设），或高级模式自定画质、CRF、码率、分辨率与输出格式
- **去水印**：框选区域，用 FFmpeg `delogo` 滤镜按周边像素插值抹除
- **文件管理**：任务列表、前后对比预览、单个或批量下载，按容量与时间自动清理旧文件
- **支持格式**：图片输出 jpg / png / webp / gif / bmp，视频输出 mp4 / webm / mov / mkv / avi / m4v。图片与视频不能互转（视频选图片格式会被拒绝）；动图转 jpg / png / bmp 只取首帧；视频保持原格式时，ogv / wmv 会改输出 mp4。视频输出统一转成 8-bit yuv420p（浏览器兼容性优先，HDR / 10-bit 源会损失色彩范围）

技术栈：Fastify + Prisma（SQLite）后端，React + Vite + Tailwind 前端，pnpm workspace 管理。

## 快速开始

需要 Node.js ≥ 20.19（推荐 22 或 24）、pnpm 9 和 FFmpeg（`ffmpeg` / `ffprobe` 在 PATH 中，或在 `api/.env.dev` 里写绝对路径，见下文「FFmpeg 要求」）。

```bash
pnpm install     # 安装依赖并生成 Prisma client
pnpm bootstrap   # 复制 api/.env.example → api/.env.dev，并创建本地 SQLite 数据库
pnpm dev         # 同时启动 api（:4010）和 web（:5010）
```

打开 <http://localhost:5010> 即可使用。默认是**本地单用户模式**：无需登录，所有任务归属同一个本地用户。

> **安全提示**：本地单用户模式没有任何登录或鉴权，默认只监听 `127.0.0.1`。如果把 `HOST` 改成 `0.0.0.0` 或放到公网，任何能访问到端口的人都能上传、处理、下载和删除文件；对外提供服务请先接入登录（见「可选：飞书登录」）并放在反向代理之后。

上传文件、处理结果和缩略图存放在 `api/data/`，数据库在 `api/prisma/dev.db`，两者都已被 git 忽略。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 本地开发（web 通过 Vite 代理访问 api） |
| `pnpm build` | 构建 api（`api/dist`）和 web（`web/dist`） |
| `pnpm typecheck` | 全部包类型检查 |
| `pnpm test` | 全部单元测试 |
| `pnpm --filter @media-compress/api db:migrate` | 修改 `api/prisma/schema.prisma` 后生成并应用迁移 |

## 配置

api 用 Node 原生的 `--env-file` 加载配置：`pnpm dev` 读 `api/.env.dev`，`pnpm start` 读 `api/.env.prod`。两者都不入库，模板是 [`api/.env.example`](api/.env.example)，每项都有注释。常用项：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `4010` | api 监听地址；见上方安全提示 |
| `TRUST_PROXY` | `loopback` | 信任的反向代理地址（Fastify `trustProxy`），限流按真实客户端 IP 分桶。同机 nginx 反代用默认值即可，不经反代直连也无需改；不要设为 `true` |
| `DATABASE_URL` | — | SQLite 路径，相对路径以 `api/prisma/` 为基准；生产建议写绝对路径 |
| `BASE_DIR` | `./data` | 上传、输出、缩略图、清理日志的根目录 |
| `FFMPEG_PATH` / `FFPROBE_PATH` | `ffmpeg` / `ffprobe` | FFmpeg 可执行文件 |
| `WORKER_COUNT` | `1` | 并发处理数 |
| `MAX_UPLOAD_BYTES` | 2 GB | 单文件上传上限 |
| `MAX_STORAGE_BYTES` / `MAX_AGE_DAYS` | 5 GB / 180 天 | 自动清理阈值。容量是每个用户的软限制：`PROTECTION_DAYS` 内访问过的任务不会因超容量被淘汰 |
| `PROTECTION_DAYS` / `LRU_CLEANUP_BYTES` | 30 天 / 1 GB | 超容量时的保护期，以及单次清理的目标释放量 |
| `FFMPEG_TIMEOUT_MS` | 600000 | 单个任务的 FFmpeg 超时（毫秒），超时任务标记失败并清除半成品 |
| `CORS_ORIGINS` | 空 | 同源部署（Vite 代理 / nginx）留空；跨域直连时填逗号分隔的来源 |
| `WHOAMI_URL` | 未设置 | 设置后启用飞书登录，见下节 |

## FFmpeg 要求

不同输出格式依赖 FFmpeg 的不同编码器：

| 输出格式 | 需要的编码器 |
| --- | --- |
| 保持原格式、png、jpg、gif、bmp | 无额外要求 |
| mp4 / mov / mkv / m4v / avi | libx264 |
| webm | libvpx-vp9（音频用 libopus） |
| webp | libwebp |

api 启动时会检测一次，日志里打印 `ffmpeg: ok` 或不支持的输出格式；页面上不支持的格式会置灰。`ffmpeg` / `ffprobe` 无法运行时（未安装、动态库缺失等），上传接口直接返回 503 `ffmpeg_unavailable`，页面顶部显示提示，修复后约 1 分钟内自动恢复（刷新页面即可），无需重启 api。

安装：

- **macOS**：Homebrew 的 `ffmpeg` 不含 libwebp。需要输出 webp 时改装 `brew install ffmpeg-full`；它不会链接进 PATH，需在 `api/.env.dev` 里写绝对路径：
  ```
  FFMPEG_PATH=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg
  FFPROBE_PATH=/opt/homebrew/opt/ffmpeg-full/bin/ffprobe
  ```
  Intel Mac 把 `/opt/homebrew` 换成 `/usr/local`；注意 Homebrew 已不再为 Intel Mac 提供预编译包，`ffmpeg-full` 及其依赖会从源码编译，耗时可能达数小时。
- **Debian**：`sudo apt install ffmpeg`，官方包已包含上表全部编码器。

## 可选：飞书登录

不设置时为本地单用户模式。需要多人使用、按人隔离任务时，可以接入同系列开源项目 feishu-sso（飞书统一登录服务）：

1. 部署 feishu-sso，并让反向代理把同一域名下的 `/auth/*` 转发给它（登录 cookie 依赖同源）。
2. api 设置 `WHOAMI_URL`，指向 feishu-sso 的 whoami 接口，例如 `http://127.0.0.1:4020/api/whoami`。
3. web 构建时设置 `VITE_SSO_BASE=/auth`（可写在 `web/.env.local`）。

两端需同时配置：只配一端时，前端与后端对「当前用户」的判断会不一致。

nginx 模板把 `X-Forwarded-For` 设为 `$remote_addr`（覆盖而不是追加），配合 `TRUST_PROXY=loopback`，客户端无法伪造来源 IP 绕过限流。api 不在本机、或前面还有一层代理时，把 `TRUST_PROXY` 改成实际代理的地址或网段。

## 部署

`deploy/` 提供 systemd 与 nginx 模板（单机部署，nginx 托管前端静态文件并反代 api）：

```bash
git clone <repo> /opt/media-compress && cd /opt/media-compress
pnpm install && pnpm build
cp api/.env.example api/.env.prod   # 改为 NODE_ENV=production，并把 DATABASE_URL / BASE_DIR 设为绝对路径
pnpm --filter @media-compress/api db:migrate:prod

sudo cp deploy/systemd.service.template /etc/systemd/system/media-compress.service
sudo sed -i 's|__INSTALL_DIR__|/opt/media-compress|; s|__SERVICE_USER__|www-data|' /etc/systemd/system/media-compress.service
sudo systemctl daemon-reload && sudo systemctl enable --now media-compress

sudo cp deploy/nginx.conf.template /etc/nginx/sites-available/media-compress
sudo sed -i 's|__INSTALL_DIR__|/opt/media-compress|; s|__SERVER_NAME__|media.example.com|' /etc/nginx/sites-available/media-compress
sudo ln -sf /etc/nginx/sites-available/media-compress /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
```

数据库运维脚本：`deploy/backup-dev-db.sh`（去重 + 分级保留的 SQLite 快照）、`deploy/db-audit.sh`（查看快照）、`deploy/db-restore.sh`（恢复快照）。生产使用时通过 `BACKUP_DB` / `BACKUP_DIR` 指定路径。

## 目录结构

```
api/        Fastify 后端：上传、任务队列、FFmpeg 处理、下载与自动清理
web/        React 前端
packages/   api 与 web 共用的小工具包（登录客户端、HTTP 客户端、日志、Tailwind 预设等）
deploy/     systemd / nginx 模板与 SQLite 运维脚本
```

## License

[MIT](LICENSE)
