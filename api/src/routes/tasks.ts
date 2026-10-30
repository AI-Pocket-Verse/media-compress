import type { FastifyPluginAsync } from 'fastify'

import { getFfmpegCapabilities } from '../config/ffmpeg-caps'
import { taskStore } from '../services/task-store'

export const tasksRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/tasks', { preHandler: app.optionalAuth() }, async (req) => {
    if (!req.user) return []
    const tasks = await taskStore.list({ ownerUserId: req.user.id })
    return tasks.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
  })

  app.get<{ Params: { task_id: string } }>(
    '/api/tasks/:task_id',
    { preHandler: app.optionalAuth() },
    async (req, reply) => {
      const task = await taskStore.get(req.params.task_id)
      if (!task) return reply.code(404).send({ code: 'not_found', message: 'task not found' })
      if (!req.user || task.owner_user_id !== req.user.id) {
        return reply.code(404).send({ code: 'not_found', message: 'task not found' })
      }
      return task
    },
  )

  app.get<{ Querystring: { refresh?: string } }>('/api/capabilities', async (req) => {
    const force = req.query.refresh === '1' || req.query.refresh === 'true'
    return getFfmpegCapabilities(force)
  })
}
