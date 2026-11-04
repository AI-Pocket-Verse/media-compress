import { createReadStream, existsSync } from 'node:fs'
import path from 'node:path'

import archiver from 'archiver'
import type { FastifyPluginAsync } from 'fastify'

import { mimeForFilename } from '../config/file-types'
import { env } from '../env'
import { taskStore } from '../services/task-store'
import { generateThumbnail, thumbPathFor } from '../services/thumbnail'
import { contentDisposition, dedupeName, downloadName } from '../utils/download-name'

// Hard cap so a crafted `ids` list can't ask us to stat/open an unbounded
// number of files. The web client batches at most 200 images per upload.
const MAX_BATCH = 200

export const downloadRoutes: FastifyPluginAsync = async (app) => {
  // Stream a single zip of several finished outputs (one upload "batch"). The
  // client passes the task ids it just created; we keep only the ones that are
  // owned, done, and still on disk, then archive them with `store` (media is
  // already compressed — re-deflating wastes CPU for ~0 gain).
  app.get<{ Querystring: { ids?: string } }>(
    '/api/download/batch',
    { preHandler: app.requireAuth() },
    async (req, reply) => {
      const ids = (req.query.ids || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_BATCH)
      if (ids.length === 0) {
        return reply.code(400).send({ code: 'no_ids', message: 'ids query param required' })
      }

      const entries: { id: string; filePath: string; name: string }[] = []
      const usedNames = new Set<string>()
      for (const id of ids) {
        const task = await taskStore.get(id)
        if (!task || task.owner_user_id !== req.user!.id || task.status !== 'done' || !task.output) continue
        const filePath = path.resolve(env.BASE_DIR, task.output.path)
        if (!existsSync(filePath)) continue
        // Use the original filename (stem) + actual output extension, de-duped
        // within the archive. After stripping the stored taskId/_compressed,
        // collisions are more likely (e.g. several photo.jpg) → dedupeName.
        const name = dedupeName(downloadName(task.input.filename, task.output.filename), usedNames)
        usedNames.add(name)
        entries.push({ id, filePath, name })
      }

      if (entries.length === 0) {
        return reply.code(404).send({ code: 'no_files', message: 'no downloadable outputs in batch' })
      }

      // Best-effort touch so the cleaner treats a batch download like a read.
      void Promise.all(
        entries.map((e) => taskStore.update(e.id, { last_accessed_at: new Date().toISOString() })),
      ).catch(() => undefined)

      const zipName = `media-compress-${entries.length}-files.zip`
      const archive = archiver('zip', { store: true })
      archive.on('error', (err) => {
        console.error('[batch-zip]', err)
        if (!reply.raw.destroyed) reply.raw.destroy(err)
      })
      for (const e of entries) archive.file(e.filePath, { name: e.name })
      void archive.finalize()

      return reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', `attachment; filename="${zipName}"`)
        .send(archive)
    },
  )


  app.get<{ Params: { task_id: string } }>(
    '/api/download/:task_id',
    { preHandler: app.requireAuth() },
    async (req, reply) => {
      const task = await taskStore.get(req.params.task_id)
      if (!task || task.owner_user_id !== req.user!.id || task.status !== 'done' || !task.output) {
        return reply.code(404).send({ code: 'not_found', message: 'output not available' })
      }
      const filePath = path.resolve(env.BASE_DIR, task.output.path)
      if (!existsSync(filePath)) {
        return reply.code(404).send({ code: 'not_found', message: 'output file missing' })
      }
      await taskStore.update(task.id, { last_accessed_at: new Date().toISOString() })
      return reply
        .header('Content-Disposition', contentDisposition(downloadName(task.input.filename, task.output.filename)))
        .type('application/octet-stream')
        .send(createReadStream(filePath))
    },
  )

  app.get<{ Params: { task_id: string } }>(
    '/api/input/:task_id',
    { preHandler: app.requireAuth() },
    async (req, reply) => {
      const task = await taskStore.get(req.params.task_id)
      if (!task || task.owner_user_id !== req.user!.id) {
        return reply.code(404).send({ code: 'not_found', message: 'task not found' })
      }
      const filePath = path.resolve(env.BASE_DIR, task.input.path)
      if (!existsSync(filePath)) return reply.code(404).send({ code: 'not_found', message: 'input file missing' })
      // 类型按扩展名重新决定：旧记录里的 mime 可能来自客户端声明。
      return reply.type(mimeForFilename(task.input.filename)).send(createReadStream(filePath))
    },
  )

  app.get<{ Params: { task_id: string } }>(
    '/api/thumbnail/:task_id',
    { preHandler: app.requireAuth() },
    async (req, reply) => {
      const task = await taskStore.get(req.params.task_id)
      if (!task || task.owner_user_id !== req.user!.id) {
        return reply.code(404).send({ code: 'not_found', message: 'task not found' })
      }
      let p = thumbPathFor(task.id)
      if (!existsSync(p)) {
        const generated = await generateThumbnail(path.resolve(env.BASE_DIR, task.input.path), task.id)
        if (!generated) return reply.code(404).send({ code: 'thumb_failed', message: 'thumbnail generation failed' })
        p = generated
      }
      return reply
        .header('Cache-Control', 'private, max-age=3600')
        .type('image/jpeg')
        .send(createReadStream(p))
    },
  )
}
