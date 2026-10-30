import { spawn } from 'node:child_process'

import { env } from '../env'

export interface FfmpegCapabilities {
  /** ffmpeg and ffprobe both run. When false, every encoder flag is false too. */
  ffmpeg_ok: boolean
  webp: boolean
  libx264: boolean
  libvpx: boolean
  libvpx_vp9: boolean
  libaom_av1: boolean
  mjpeg: boolean
  png: boolean
  gif: boolean
}

/** Output format → encoder it needs. Formats not listed need no optional encoder. */
export const FORMAT_REQUIRES: Partial<Record<string, keyof FfmpegCapabilities>> = {
  webp: 'webp', mp4: 'libx264', m4v: 'libx264', mov: 'libx264', mkv: 'libx264', avi: 'libx264', webm: 'libvpx_vp9',
}

const CACHE_TTL_MS = 60 * 1000
let cache: FfmpegCapabilities | null = null
let cachedAt = 0
// Last probe result, so the failure reason is logged once per outage rather
// than on every probe.
let lastOk: boolean | null = null

export async function getFfmpegCapabilities(force = false): Promise<FfmpegCapabilities> {
  const now = Date.now()
  if (!force && cache && now - cachedAt < CACHE_TTL_MS) return cache

  const caps: FfmpegCapabilities = {
    ffmpeg_ok: false, webp: false, libx264: false, libvpx: false, libvpx_vp9: false,
    libaom_av1: false, mjpeg: false, png: false, gif: false,
  }

  try {
    // Uploads probe with ffprobe and process with ffmpeg; both must run.
    await runWithTimeout([env.FFPROBE_PATH, '-version'], 8000)
    const text = await runWithTimeout([env.FFMPEG_PATH, '-hide_banner', '-encoders'], 8000)
    caps.ffmpeg_ok = true
    caps.webp = text.includes('libwebp')
    caps.libx264 = text.includes('libx264')
    caps.libvpx = / libvpx /.test(text)
    caps.libvpx_vp9 = text.includes('libvpx-vp9')
    caps.libaom_av1 = text.includes('libaom-av1')
    caps.mjpeg = text.includes('mjpeg')
    caps.png = / png /.test(text)
    caps.gif = / gif /.test(text)
  } catch (e) {
    if (lastOk !== false) {
      console.error(
        `[ffmpeg] unavailable, uploads are rejected until fixed ` +
        `(FFMPEG_PATH=${env.FFMPEG_PATH}, FFPROBE_PATH=${env.FFPROBE_PATH}): ${(e as Error).message}`,
      )
    }
  }
  if (caps.ffmpeg_ok && lastOk === false) console.log('[ffmpeg] available again')
  lastOk = caps.ffmpeg_ok

  cache = caps
  cachedAt = now
  return caps
}

function runWithTimeout(argv: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = argv
    const child = spawn(cmd!, args)
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('ffmpeg capability probe timed out'))
    }, timeoutMs)
    child.stdout.on('data', (d) => (out += d.toString()))
    child.stderr.on('data', (d) => (err += d.toString()))
    child.on('close', (code) => {
      clearTimeout(timer)
      // A broken install (e.g. missing shared library) still spawns but exits
      // non-zero; treat that as unavailable, not as "no encoders".
      if (code === 0) resolve(out + err)
      else reject(new Error(`${cmd} exited ${code}: ${err.trim().slice(0, 500)}`))
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}
