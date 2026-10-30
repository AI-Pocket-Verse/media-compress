import { spawn } from 'node:child_process'
import path from 'node:path'

import { getMediaType, type MediaType } from '../config/file-types'
import { env } from '../env'

const QUALITY_MAP: Record<string, number> = { smallest: 50, balanced: 75, highest: 90 }
const CRF_MAP: Record<string, number> = { smallest: 35, balanced: 23, highest: 18 }

// WebM only accepts VP8/VP9/AV1 video and Vorbis/Opus audio; every other
// video container gets H.264 + AAC.
function isWebm(output: string): boolean {
  return path.extname(output).toLowerCase() === '.webm'
}

function audioFlags(choice: string, webm: boolean): string[] {
  // Copying into WebM fails for the common AAC source, so WebM always re-encodes.
  if (choice === 'copy' && !webm) return ['-c:a', 'copy']
  if (choice === 'none') return ['-an']
  return ['-c:a', webm ? 'libopus' : 'aac', '-b:a', '128k']
}

function resolveAudio(options: Record<string, unknown>, preset: string): string {
  const explicit = options.audio as string | undefined
  if (explicit === 'copy' || explicit === 'reencode' || explicit === 'none') return explicit
  return preset === 'mobile' ? 'none' : 'reencode'
}

// Parse a resolution option into a target W×H box, or null for "keep original".
// Accepts 'WxH' (e.g. '1920x1080') and legacy presets ('1080p'|'720p'|'480p').
export function resolveWH(resolution: string | undefined | null): { w: number; h: number } | null {
  if (!resolution || resolution === 'original') return null
  const legacy: Record<string, [number, number]> = {
    '1080p': [1920, 1080],
    '720p': [1280, 720],
    '480p': [854, 480],
  }
  const preset = legacy[resolution]
  if (preset) return { w: preset[0], h: preset[1] }
  const m = /^(\d{1,5})x(\d{1,5})$/.exec(resolution)
  if (!m) return null
  const w = parseInt(m[1]!, 10)
  const h = parseInt(m[2]!, 10)
  if (!w || !h) return null
  return { w, h }
}

// Build an ffmpeg `scale` filter that fits the source within the W×H box,
// preserving aspect ratio and never upscaling (min(W,iw)/min(H,ih) caps the
// box at the source size). Video appends force_divisible_by=2 so libx264 always
// gets even dimensions. Returns null for "keep original".
export function scaleFilter(resolution: string | undefined | null, mediaType: MediaType): string | null {
  const wh = resolveWH(resolution)
  if (!wh) return null
  const base = `scale=w='min(${wh.w},iw)':h='min(${wh.h},ih)':force_original_aspect_ratio=decrease`
  return mediaType === 'video' ? `${base}:force_divisible_by=2` : base
}

function outputFilename(taskId: string, original: string, format: string | undefined): string {
  const stem = path.basename(original, path.extname(original))
  const origExt = path.extname(original).toLowerCase()
  const ext = format && format !== 'original' && format !== ''
    ? '.' + format.toLowerCase().replace(/^\./, '')
    : origExt
  return `${taskId.slice(0, 8)}_${stem}_compressed${ext}`
}

export function buildCompressCommand(
  input: string,
  output: string,
  options: Record<string, unknown>,
  mediaType: MediaType,
): string[] {
  const mode = (options.mode as string) ?? 'simple'
  const preset = (options.quality_preset as string) ?? 'balanced'

  // Unified scale from the resolution option, applied to ALL presets (incl.
  // mobile). null = keep original. `custom_resolution` kept for back-compat.
  const scale = scaleFilter(
    (options.resolution as string) ?? (options.custom_resolution as string),
    mediaType,
  )

  // ─── mobile preset: app-optimized encoding. Resolution comes from the unified
  // `scale` above, so "keep original" no longer auto-downscales. ───
  const webm = isWebm(output)

  if (mode === 'simple' && preset === 'mobile') {
    if (mediaType === 'video') {
      const vf = [scale, 'fps=30'].filter(Boolean).join(',')
      const video = webm
        ? ['-c:v', 'libvpx-vp9', '-crf', '23', '-b:v', '0']
        : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23']
      return [
        '-y', '-i', input,
        '-vf', vf,
        ...video,
        ...audioFlags(resolveAudio(options, preset), webm),
        ...(webm ? [] : ['-movflags', '+faststart']),
        output,
      ]
    }
    const imgCmd: string[] = ['-y', '-i', input]
    if (scale) imgCmd.push('-vf', scale)
    imgCmd.push('-quality', '80', output)
    return imgCmd
  }

  const cmd: string[] = ['-y', '-i', input]
  if (scale) cmd.push('-vf', scale)

  if (mediaType === 'video') {
    const crf = mode === 'advanced'
      ? (options.crf as number | undefined)
      : CRF_MAP[preset] ?? 23
    cmd.push('-c:v', webm ? 'libvpx-vp9' : 'libx264', '-crf', String(crf ?? 23))
    // libvpx-vp9 needs -b:v 0 for constant-quality CRF; otherwise it caps
    // at its default target bitrate.
    if (options.bitrate) cmd.push('-b:v', String(options.bitrate))
    else if (webm) cmd.push('-b:v', '0')
    if (options.fps) cmd.push('-r', String(options.fps))
    cmd.push(...audioFlags(resolveAudio(options, preset), webm))
  } else {
    const outExt = path.extname(output).toLowerCase()
    const quality = mode === 'advanced' && options.quality != null
      ? Number(options.quality)
      : QUALITY_MAP[preset] ?? 75

    if (outExt === '.jpg' || outExt === '.jpeg') {
      const qv = Math.max(2, Math.min(31, Math.round(31 - (quality / 100) * 29)))
      cmd.push('-q:v', String(qv))
    } else if (outExt === '.webp') {
      cmd.push('-quality', String(quality))
    } else if (outExt === '.png') {
      const levelMap: Record<string, number> = { smallest: 9, balanced: 6, highest: 3 }
      cmd.push('-compression_level', String(levelMap[preset] ?? 6), '-pred', 'mixed')
    }
  }

  cmd.push(output)
  return cmd
}

export async function compress(
  inputPath: string,
  options: Record<string, unknown>,
  taskId: string,
  originalFilename: string,
): Promise<string> {
  const mediaType = getMediaType(originalFilename)
  const outName = outputFilename(taskId, originalFilename, options.output_format as string | undefined)
  const outPath = path.join(env.OUTPUT_DIR, outName)
  const args = buildCompressCommand(inputPath, outPath, options, mediaType)
  await runFfmpeg(args, env.FFMPEG_TIMEOUT_MS)
  return outPath
}

export function runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(env.FFMPEG_PATH, args)
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`ffmpeg timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `ffmpeg exited ${code}`))
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}
