import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import path from 'node:path'

import { getMediaType } from '../config/file-types'
import { env } from '../env'

const MAX_SIZE = 240

export function thumbPathFor(taskId: string): string {
  return path.join(env.THUMBNAIL_DIR, `${taskId.slice(0, 8)}.jpg`)
}

export async function generateThumbnail(inputPath: string, taskId: string): Promise<string | null> {
  const out = thumbPathFor(taskId)
  if (existsSync(out)) return out
  if (!existsSync(inputPath)) return null

  const mediaType = getMediaType(inputPath)
  const scale = `scale='min(${MAX_SIZE},iw)':-2`

  const runArgs = (args: string[]) =>
    new Promise<boolean>((resolve) => {
      const child = spawn(env.FFMPEG_PATH, args)
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        resolve(false)
      }, 15_000)
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve(code === 0 && existsSync(out))
      })
      child.on('error', () => {
        clearTimeout(timer)
        resolve(false)
      })
    })

  const base = ['-y', '-hide_banner', '-v', 'error', '-i', inputPath]

  if (mediaType === 'video') {
    const ok = await runArgs([...base, '-ss', '00:00:01', '-frames:v', '1', '-vf', scale, '-q:v', '5', out])
    if (ok) return out
    const retry = await runArgs([...base, '-frames:v', '1', '-vf', scale, '-q:v', '5', out])
    return retry ? out : null
  }
  const ok = await runArgs([...base, '-vf', scale, '-q:v', '5', out])
  return ok ? out : null
}

export async function deleteThumbnail(taskId: string): Promise<void> {
  const p = thumbPathFor(taskId)
  if (existsSync(p)) {
    try {
      await unlink(p)
    } catch {
      /* ignore */
    }
  }
}
