import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'

import apiKit from '@media-compress/api-kit'
import authPlugin from '@media-compress/auth-client-api'

import { FORMAT_REQUIRES, getFfmpegCapabilities } from './config/ffmpeg-caps'
import { initDb, prisma } from './db'
import { env } from './env'
import { downloadRoutes } from './routes/download'
import { filesRoutes } from './routes/files'
import { tasksRoutes } from './routes/tasks'
import { uploadRoutes } from './routes/upload'
import { watermarkRoutes } from './routes/watermark'
import { initWorker, recoverPendingOnStartup, shutdownWorker } from './services/worker'
import { hostGuard, parseAllowedHosts } from './utils/host-guard'

const app = Fastify({ logger: false, bodyLimit: env.MAX_UPLOAD_BYTES, trustProxy: env.TRUST_PROXY })

// 本地模式没有登录，拒绝非本机 Host / 跨站 Origin 的请求（防 DNS 重绑定与跨站上传）。
if (!env.WHOAMI_URL) app.addHook('onRequest', hostGuard(parseAllowedHosts(env.ALLOWED_HOSTS)))

// Ensure storage roots exist
await Promise.all(
  [env.BASE_DIR, env.UPLOAD_DIR, env.OUTPUT_DIR, env.THUMBNAIL_DIR].map((d) =>
    mkdir(resolve(d), { recursive: true }),
  ),
)

// SQLite WAL + foreign keys (Prisma). Schema/tables come from `prisma migrate`.
await initDb()

const corsOrigins = env.CORS_ORIGINS.split(/\s+/).filter(Boolean)
await app.register(cors, {
  // No origin → same-origin only (reverse proxy). Allowlist mode when configured.
  origin: corsOrigins.length > 0 ? corsOrigins : false,
  credentials: true,
})
await app.register(rateLimit, { max: 200, timeWindow: '1 minute' })
// 禁止浏览器嗅探响应类型：回传的用户文件只按声明的媒体类型处理，不会被当成 HTML / 脚本执行。
app.addHook('onSend', async (_req, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff')
})
await app.register(multipart, {
  limits: { fileSize: env.MAX_UPLOAD_BYTES },
})
await app.register(apiKit, { service: 'media-compress-api', version: '0.0.0' })
await app.register(authPlugin, { whoamiUrl: env.WHOAMI_URL })

await app.register(uploadRoutes)
await app.register(watermarkRoutes)
await app.register(tasksRoutes)
await app.register(downloadRoutes)
await app.register(filesRoutes)

// 单端口模式（Docker）：api 顺带托管前端，未知路径回退 index.html 交给前端路由。
if (env.WEB_DIST_DIR) {
  await app.register(fastifyStatic, { root: resolve(env.WEB_DIST_DIR) })
  app.setNotFoundHandler((req, reply) => {
    if (req.method !== 'GET' || req.url.startsWith('/api/')) {
      return reply.code(404).send({ code: 'not_found', message: 'route not found' })
    }
    return reply.sendFile('index.html')
  })
}

// Worker lifecycle
initWorker()
await recoverPendingOnStartup()

const shutdown = async () => {
  console.log('[media-compress-api] shutting down')
  await shutdownWorker()
  await app.close()
  await prisma.$disconnect()
  process.exit(0)
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)

app
  .listen({ port: env.PORT, host: env.HOST })
  .then(async () => {
    console.log(`[media-compress-api] listening on http://${env.HOST}:${env.PORT}`)
    console.log(`[media-compress-api] auth: ${env.WHOAMI_URL ? `SSO via ${env.WHOAMI_URL}` : 'local single-user mode'}`)
    // Failure details are logged by the probe itself.
    const caps = await getFfmpegCapabilities()
    const missing = Object.entries(FORMAT_REQUIRES).filter(([, enc]) => !caps[enc!]).map(([fmt]) => fmt)
    console.log(`[media-compress-api] ffmpeg: ${
      !caps.ffmpeg_ok ? 'UNAVAILABLE' : missing.length ? `ok, unsupported output formats: ${missing.join(', ')}` : 'ok'
    }`)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
