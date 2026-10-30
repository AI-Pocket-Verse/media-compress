import path from 'node:path'
import { randomUUID } from 'node:crypto'

import type { FastifyPluginAsync } from 'fastify'

import { FORMAT_REQUIRES, getFfmpegCapabilities } from '../config/ffmpeg-caps'
import { env } from '../env'
import { CompressOptions } from '../schemas/compress'
import { runCleanup } from '../services/cleaner'
import { taskStore } from '../services/task-store'
import { submitTask } from '../services/worker'
import { probeFile } from '../utils/probe'

import { UploadError, requireFfmpeg, streamSaveValidated } from './_helpers'

async function checkFormatSupported(format: string | undefined): Promise<void> {
  if (!format) return
  const need = FORMAT_REQUIRES[format]
  if (!need) return
  const caps = await getFfmpegCapabilities()
  if (!caps[need]) {
    throw new UploadError(
      400,
      `output format '${format}' requires ffmpeg encoder '${need}', not available on this server.`,
    )
  }
}

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/upload', { preHandler: [app.requireAuth(), requireFfmpeg] }, async (req, reply) => {
    let filePart: Awaited<ReturnType<typeof req.file>> | undefined
    let optionsRaw: string | undefined

    try {
      for await (const part of req.parts()) {
        if (part.type === 'file' && part.fieldname === 'file') {
          filePart = part
          break // first file part (we'll need to consume it next)
        }
        if (part.type === 'field' && part.fieldname === 'options') {
          optionsRaw = String(part.value)
        }
      }
    } catch (e) {
      return reply.code(400).send({ code: 'multipart_error', message: (e as Error).message })
    }

    if (!filePart) return reply.code(400).send({ code: 'no_file', message: 'file part missing' })
    if (!optionsRaw) {
      // drain file so the request can complete
      filePart.file.resume()
      return reply.code(400).send({ code: 'no_options', message: 'options field missing' })
    }

    let parsed: unknown
    try { parsed = JSON.parse(optionsRaw) } catch (e) {
      filePart.file.resume()
      return reply.code(400).send({ code: 'invalid_options', message: `invalid options JSON: ${(e as Error).message}` })
    }
    const result = CompressOptions.safeParse(parsed)
    if (!result.success) {
      filePart.file.resume()
      return reply.code(400).send({ code: 'invalid_options', message: result.error.issues.map(i => i.message).join('; ') })
    }

    try {
      await checkFormatSupported(result.data.output_format)
    } catch (e) {
      filePart.file.resume()
      if (e instanceof UploadError) return reply.code(e.statusCode).send({ code: 'unsupported_format', message: e.message })
      throw e
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
      type: 'compress',
      status: 'pending',
      owner_user_id: req.user!.id,
      created_at: now, updated_at: now, last_accessed_at: now,
      input: {
        filename: saved.safeName,
        path: saved.relPath,
        size: saved.size,
        mime: filePart.mimetype || 'application/octet-stream',
        metadata: meta,
      },
      options: result.data as unknown as Record<string, unknown>,
    })

    await runCleanup(req.user!.id).catch((err) => console.error('[cleanup]', err))
    submitTask(taskId)

    return { task_id: taskId, filename: saved.safeName }
  })
}
