import { existsSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import path from 'node:path'

import type { FastifyPluginAsync } from 'fastify'

import { env } from '../env'
import { taskStore } from '../services/task-store'
import { deleteThumbnail } from '../services/thumbnail'

export const filesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/files', { preHandler: app.optionalAuth() }, async (req) => {
    if (!req.user) return { tasks: [], total_bytes: 0 }
    const tasks = await taskStore.list({ ownerUserId: req.user.id })
    let total = 0
    for (const t of tasks) {
      total += (t.input.size || 0) + (t.output?.size ?? 0)
    }
    return { tasks: tasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), total_bytes: total }
  })

  app.delete<{ Params: { task_id: string } }>(
    '/api/files/:task_id',
    { preHandler: app.requireAuth() },
    async (req, reply) => {
      const task = await taskStore.get(req.params.task_id)
      if (!task || task.owner_user_id !== req.user!.id) {
        return reply.code(404).send({ code: 'not_found', message: 'task not found' })
      }

      // 处理中删除会让 ffmpeg 继续写出无人认领的输出文件，等任务结束后再删。
      if (task.status === 'processing') {
        return reply.code(409).send({ code: 'task_processing', message: 'task is still processing; delete it after it finishes' })
      }

      for (const rel of [task.input.path, task.output?.path].filter(Boolean) as string[]) {
        const full = path.resolve(env.BASE_DIR, rel)
        if (existsSync(full)) {
          try { await unlink(full) } catch { /* ignore */ }
        }
      }
      await deleteThumbnail(task.id)
      await taskStore.remove(task.id)
      return { deleted: req.params.task_id }
    },
  )
}
