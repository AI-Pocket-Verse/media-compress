import path from 'node:path'
import { stat } from 'node:fs/promises'

import PQueue from 'p-queue'

import { env } from '../env'

import { probeFile, type ProbeResult } from '../utils/probe'

import { compress, FfmpegError } from './compressor'
import { removeWatermark, type Region } from './delogo'
import { taskStore, type Task } from './task-store'

let queue: PQueue | null = null
const inflight = new Set<string>()

export function initWorker(): void {
  if (!queue) queue = new PQueue({ concurrency: env.WORKER_COUNT })
}

export async function shutdownWorker(): Promise<void> {
  if (queue) {
    queue.clear()
    await queue.onIdle()
    queue = null
  }
}

export function submitTask(taskId: string): void {
  if (inflight.has(taskId)) return
  inflight.add(taskId)
  if (!queue) initWorker()
  queue!
    .add(() => processTask(taskId))
    .catch((err) => console.error('[worker] task', taskId, 'crashed:', err))
    .finally(() => inflight.delete(taskId))
}

async function processTask(taskId: string): Promise<void> {
  const task = await taskStore.get(taskId)
  if (!task) return

  await taskStore.update(taskId, { status: 'processing' })

  try {
    const inputFull = path.resolve(env.BASE_DIR, task.input.path)
    let outPath: string

    if (task.type === 'compress') {
      outPath = await compress(inputFull, task.options, task.id, task.input.filename)
    } else {
      const regions = (task.options.regions as Region[]) ?? []
      const v = (task.input.metadata as ProbeResult | undefined)?.video
      const dims = v ? { width: v.width, height: v.height } : undefined
      outPath = await removeWatermark(inputFull, regions, task.id, task.input.filename, dims)
    }

    const outSize = (await stat(outPath)).size
    const relPath = path.posix.join('outputs', path.basename(outPath))
    // Probe the output so the UI can show width × height · fps · duration for
    // the processed file in the compare modal. Failures are non-fatal.
    const outMeta = await probeFile(outPath).catch(() => null)

    const patch: Partial<Task> = {
      status: 'done',
      output: { filename: path.basename(outPath), path: relPath, size: outSize, metadata: outMeta ?? undefined },
    }

    if (task.type === 'compress' && task.input.size > 0) {
      const saved = task.input.size - outSize
      const ratio = Math.round((saved / task.input.size) * 10_000) / 10_000
      patch.result = { saved_bytes: saved, compression_ratio: ratio }
    }

    await taskStore.update(taskId, patch)
  } catch (e) {
    console.error(`[worker] task ${taskId} failed:`, e)
    // 只把已整理过的 ffmpeg 错误给用户；其他异常（可能带服务器路径）只写日志。
    const msg = e instanceof FfmpegError ? e.message : 'internal_error: 处理失败，请稍后重试'
    await taskStore.update(taskId, { status: 'failed', error: msg })
  }
}

export async function recoverPendingOnStartup(): Promise<void> {
  const tasks = await taskStore.list()
  const seen = new Set<string>()
  for (const t of tasks) {
    if (seen.has(t.id)) continue
    seen.add(t.id)
    if (t.status === 'processing') {
      await taskStore.update(t.id, { status: 'pending' })
      submitTask(t.id)
    } else if (t.status === 'pending') {
      submitTask(t.id)
    }
  }
}
