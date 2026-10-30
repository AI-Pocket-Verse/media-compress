/**
 * SQLite task store (Prisma). Replaces the original JSON-file store; the public
 * `taskStore` interface and the `Task` shape are unchanged, so routes / worker /
 * cleaner are untouched. The nested objects (input/output/options/result) are
 * JSON-encoded into TEXT columns here — Prisma's SQLite connector has no native
 * JSON type — and decoded on the way out, so callers still see plain objects
 * and ISO-8601 timestamp strings.
 */
import { Prisma } from '../../generated/prisma'
import type { Task as TaskRow } from '../../generated/prisma'

import { prisma } from '../db'

export type TaskKind = 'compress' | 'watermark'
export type TaskStatus = 'pending' | 'processing' | 'done' | 'failed'

export interface FileInfo {
  filename: string
  path: string
  size: number
  mime: string
  metadata?: unknown
}

export interface OutputInfo {
  filename: string
  path: string
  size: number
  /** ffprobe of the processed file (width/height/duration/fps). */
  metadata?: unknown
}

export interface CompressionResult {
  saved_bytes: number
  compression_ratio: number
}

export interface Task {
  id: string
  type: TaskKind
  status: TaskStatus
  /** Owner user id ('local' in local mode, the SSO user id otherwise). */
  owner_user_id: string
  created_at: string
  updated_at: string
  last_accessed_at: string
  input: FileInfo
  output?: OutputInfo
  options: Record<string, unknown>
  result?: CompressionResult
  error?: string
}

// ── row <-> Task mappers ────────────────────────────────────────────────────

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    type: row.type as TaskKind,
    status: row.status as TaskStatus,
    owner_user_id: row.ownerUserId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    last_accessed_at: row.lastAccessedAt.toISOString(),
    input: JSON.parse(row.input) as FileInfo,
    output: row.output === null ? undefined : (JSON.parse(row.output) as OutputInfo),
    options: JSON.parse(row.options) as Record<string, unknown>,
    result: row.result === null ? undefined : (JSON.parse(row.result) as CompressionResult),
    error: row.error ?? undefined,
  }
}

export const taskStore = {
  async create(task: Task): Promise<Task> {
    const row = await prisma.task.create({
      data: {
        id: task.id,
        type: task.type,
        status: task.status,
        ownerUserId: task.owner_user_id,
        input: JSON.stringify(task.input),
        output: task.output === undefined ? null : JSON.stringify(task.output),
        options: JSON.stringify(task.options),
        result: task.result === undefined ? null : JSON.stringify(task.result),
        error: task.error ?? null,
        createdAt: new Date(task.created_at),
        lastAccessedAt: new Date(task.last_accessed_at),
        // updatedAt is @updatedAt — Prisma sets it on create + every update.
      },
    })
    return toTask(row)
  },

  async get(id: string): Promise<Task | null> {
    const row = await prisma.task.findUnique({ where: { id } })
    return row ? toTask(row) : null
  },

  async list(filter?: { ownerUserId?: string }): Promise<Task[]> {
    const rows = await prisma.task.findMany({
      where: filter?.ownerUserId !== undefined ? { ownerUserId: filter.ownerUserId } : undefined,
      // Preserve the old JSON-store order (append = creation order).
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toTask)
  },

  async update(id: string, patch: Partial<Task>): Promise<Task | null> {
    const data: Prisma.TaskUpdateInput = {}
    if (patch.type !== undefined) data.type = patch.type
    if (patch.status !== undefined) data.status = patch.status
    if (patch.owner_user_id !== undefined) data.ownerUserId = patch.owner_user_id
    if (patch.input !== undefined) data.input = JSON.stringify(patch.input)
    if (patch.output !== undefined) data.output = JSON.stringify(patch.output)
    if (patch.options !== undefined) data.options = JSON.stringify(patch.options)
    if (patch.result !== undefined) data.result = JSON.stringify(patch.result)
    if (patch.error !== undefined) data.error = patch.error ?? null
    if (patch.last_accessed_at !== undefined) data.lastAccessedAt = new Date(patch.last_accessed_at)
    // updatedAt auto-bumped by @updatedAt.
    try {
      const row = await prisma.task.update({ where: { id }, data })
      return toTask(row)
    } catch (e) {
      // Row gone between read and write → behave like the old store (null).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null
      throw e
    }
  },

  async remove(id: string): Promise<boolean> {
    const { count } = await prisma.task.deleteMany({ where: { id } })
    return count > 0
  },
}
