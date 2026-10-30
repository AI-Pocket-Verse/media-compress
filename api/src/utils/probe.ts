import { spawn } from 'node:child_process'

import { env } from '../env'

export interface ProbeResult {
  format_name?: string | null
  duration_sec?: number | null
  bit_rate?: number | null
  video?: {
    codec?: string | null
    width?: number | null
    height?: number | null
    pix_fmt?: string | null
    fps?: number | null
    bit_rate?: number | null
    profile?: string | null
  }
  audio?: {
    codec?: string | null
    channels?: number | null
    sample_rate?: number | null
    bit_rate?: number | null
  }
}

export async function probeFile(filePath: string, timeoutMs = 15_000): Promise<ProbeResult | null> {
  try {
    const text = await runProbe(filePath, timeoutMs)
    const data = JSON.parse(text) as {
      format?: Record<string, unknown>
      streams?: Array<Record<string, unknown>>
    }
    const fmt = (data.format ?? {}) as Record<string, unknown>
    const streams = data.streams ?? []
    const summary: ProbeResult = {
      format_name: (fmt.format_name as string) ?? null,
      duration_sec: safeFloat(fmt.duration),
      bit_rate: safeInt(fmt.bit_rate),
    }
    const vs = streams.find((s) => s.codec_type === 'video')
    if (vs) {
      summary.video = {
        codec: (vs.codec_name as string) ?? null,
        width: (vs.width as number) ?? null,
        height: (vs.height as number) ?? null,
        pix_fmt: (vs.pix_fmt as string) ?? null,
        fps: parseFps(vs.r_frame_rate as string | undefined),
        bit_rate: safeInt(vs.bit_rate),
        profile: (vs.profile as string) ?? null,
      }
    }
    const aud = streams.find((s) => s.codec_type === 'audio')
    if (aud) {
      summary.audio = {
        codec: (aud.codec_name as string) ?? null,
        channels: (aud.channels as number) ?? null,
        sample_rate: safeInt(aud.sample_rate),
        bit_rate: safeInt(aud.bit_rate),
      }
    }
    return summary
  } catch {
    return null
  }
}

function runProbe(filePath: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner', '-v', 'error',
      '-print_format', 'json',
      '-show_format', '-show_streams',
      filePath,
    ]
    const child = spawn(env.FFPROBE_PATH, args)
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('ffprobe timed out'))
    }, timeoutMs)
    child.stdout.on('data', (d) => (out += d.toString()))
    child.stderr.on('data', (d) => (err += d.toString()))
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(out || '{}')
      else reject(new Error(err.trim() || `ffprobe exited ${code}`))
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}

function safeFloat(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null
}
function safeInt(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}
function parseFps(rate: string | undefined): number | null {
  if (!rate) return null
  if (rate.includes('/')) {
    const [num, den] = rate.split('/', 2)
    const d = Number(den)
    if (!d) return null
    return Math.round((Number(num) / d) * 100) / 100
  }
  const n = Number(rate)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}
