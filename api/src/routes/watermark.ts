import path from 'node:path'
import { randomUUID } from 'node:crypto'

import type { FastifyPluginAsync } from 'fastify'

import { mimeForFilename } from '../config/file-types'
import { env } from '../env'
import { Region } from '../schemas/compress'
import { runCleanup } from '../services/cleaner'
import { taskStore } from '../services/task-store'
import { submitTask } from '../services/worker'
import { probeFile } from '../utils/probe'

import { UploadError, requireFfmpeg, streamSaveValidated } from './_helpers'

const MAX_REGIONS = 50

export const watermarkRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/watermark', { preHandler: [app.requireAuth(), requireFfmpeg] }, async (req, reply) => {
    let filePart: Awaited<ReturnType<typeof req.file>> | undefined
    let regionsRaw: string | undefined

    try {
      for await (const part of req.parts()) {
        if (part.type === 'file' && part.fieldname === 'file') {
          filePart = part
          break
        }
        if (part.type === 'field' && part.fieldname === 'regions') {
          regionsRaw = String(part.value)
        }
      }
    } catch (e) {
      return reply.code(400).send({ code: 'multipart_error', message: (e as Error).message })
    }

    if (!filePart) return reply.code(400).send({ code: 'no_file', message: 'file part missing' })
    if (!regionsRaw) {
      filePart.file.resume()
      return reply.code(400).send({ code: 'no_regions', message: 'regions field missing' })
    }

    let rawRegions: unknown
    try { rawRegions = JSON.parse(regionsRaw) } catch (e) {
      filePart.file.resume()
      return reply.code(400).send({ code: 'invalid_regions', message: `invalid regions JSON: ${(e as Error).message}` })
    }
    if (!Array.isArray(rawRegions) || rawRegions.length === 0) {
      filePart.file.resume()
      return reply.code(400).send({ code: 'invalid_regions', message: 'at least one region required' })
    }
    // 每个区域对应一个 delogo 滤镜；不设上限时构造的请求能让 ffmpeg 参数超长或长时间占用 worker。
    if (rawRegions.length > MAX_REGIONS) {
      filePart.file.resume()
      return reply.code(400).send({ code: 'invalid_regions', message: `at most ${MAX_REGIONS} regions` })
    }

    const parsed = Region.array().safeParse(rawRegions)
    if (!parsed.success) {
      filePart.file.resume()
      return reply.code(400).send({ code: 'invalid_regions', message: parsed.error.issues.map(i => i.message).join('; ') })
    }

    const taskId = randomUUID()
    let saved
    try {
      saved = await streamSaveValidated(filePart, taskId)
    } catch (e) {
      if (e instanceof UploadError) return reply.code(e.statusCode).send({ code: 'upload_failed', message: e.message })
      throw e
    }

    const meta = await probeFile(path.resolve(env.BASE_DIR, saved.relPath))
    const now = new Date().toISOString()
    await taskStore.create({
      id: taskId,
      type: 'watermark',
      status: 'pending',
      owner_user_id: req.user!.id,
      created_at: now, updated_at: now, last_accessed_at: now,
      input: {
        filename: saved.safeName,
        path: saved.relPath,
        size: saved.size,
        mime: mimeForFilename(saved.safeName),
        metadata: meta,
      },
      options: { regions: parsed.data },
    })

    await runCleanup(req.user!.id).catch((err) => console.error('[cleanup]', err))
    submitTask(taskId)

    return { task_id: taskId, filename: saved.safeName }
  })
}
