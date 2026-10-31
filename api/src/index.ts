import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
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

const app = Fastify({ logger: false, bodyLimit: env.MAX_UPLOAD_BYTES, trustProxy: env.TRUST_PROXY })

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
