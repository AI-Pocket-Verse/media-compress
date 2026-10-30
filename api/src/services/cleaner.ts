import { appendFile, stat, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { env } from '../env'

import { deleteThumbnail } from './thumbnail'
import { taskStore, type Task } from './task-store'

function totalBytes(tasks: Task[]): number {
  return tasks.reduce((sum, t) => sum + (t.input.size || 0) + (t.output?.size ?? 0), 0)
}

async function log(message: string): Promise<void> {
  try {
    await appendFile(env.CLEANER_LOG, `[${new Date().toISOString()}] ${message}\n`)
  } catch {
    /* ignore */
  }
}

async function deleteTaskFiles(task: Task): Promise<number> {
  let freed = 0
  for (const rel of [task.input.path, task.output?.path].filter(Boolean) as string[]) {
    const full = path.resolve(env.BASE_DIR, rel)
    if (existsSync(full)) {
      try {
        const { size } = await stat(full)
        await unlink(full)
        freed += size
      } catch {
        /* ignore */
      }
    }
  }
  await deleteThumbnail(task.id)
  return freed
}

/**
 * Cleanup policy:
 *   - 180-day max age applies globally (retention policy, not a quota).
 *   - MAX_STORAGE_BYTES is a PER-USER quota. Without this, one heavy user
 *     could evict another's recent tasks. Called from upload/watermark routes
 *     with the uploading user's id so each user only cleans their own bucket.
 *   - Without an ownerUserId (e.g. boot-time global sweep) only the age policy
 *     is enforced; size-based eviction is skipped to avoid cross-user starvation.
 */
export async function runCleanup(ownerUserId?: string): Promise<void> {
  const allTasks = await taskStore.list()
  const userTasks = ownerUserId ? allTasks.filter((t) => t.owner_user_id === ownerUserId) : null
  const now = Date.now()
  const ageCutoff = now - env.MAX_AGE_DAYS * 86_400_000
  const protectionCutoff = now - env.PROTECTION_DAYS * 86_400_000

  const tooOldGlobal = allTasks.filter((t) => new Date(t.created_at).getTime() < ageCutoff)
  let userTotal = userTasks ? totalBytes(userTasks) : 0
  let overSize = !!userTasks && userTotal > env.MAX_STORAGE_BYTES
  if (tooOldGlobal.length === 0 && !overSize) return

  // Build the candidate pool. Size-based eviction is scoped to userTasks;
  // age-based eviction sweeps everyone.
  const sizeCandidates = userTasks ?? []
  const candidates = [
    ...tooOldGlobal,
    ...sizeCandidates.filter((t) => !tooOldGlobal.some((o) => o.id === t.id)),
  ].sort((a, b) => new Date(a.last_accessed_at).getTime() - new Date(b.last_accessed_at).getTime())

  let freedTotal = 0
  let remaining = [...candidates]

  for (const t of candidates) {
    const createdAt = new Date(t.created_at).getTime()
    const lastAccess = new Date(t.last_accessed_at).getTime()
    const isOverAge = createdAt < ageCutoff
    const isProtected = lastAccess > protectionCutoff
    if (isProtected && !isOverAge) continue
    // Size-eviction only deletes tasks owned by the over-quota user.
    if (!isOverAge && userTasks && t.owner_user_id !== ownerUserId) continue

    const freed = await deleteTaskFiles(t)
    await taskStore.remove(t.id)
    remaining = remaining.filter((o) => o.id !== t.id)
    freedTotal += freed
    if (userTasks && t.owner_user_id === ownerUserId) {
      userTotal -= freed
      overSize = userTotal > env.MAX_STORAGE_BYTES
    }
    const tooOldRemaining = remaining.some((o) => new Date(o.created_at).getTime() < ageCutoff)

    await log(
      `deleted task=${t.id} owner=${t.owner_user_id} freed=${freed}B ` +
        `(age=${Math.floor((now - createdAt) / 86_400_000)}d, ` +
        `last_access=${Math.floor((now - lastAccess) / 86_400_000)}d)`,
    )

    if (!overSize && !tooOldRemaining) break
    if (freedTotal >= env.LRU_CLEANUP_BYTES && !tooOldRemaining) break
  }
}
