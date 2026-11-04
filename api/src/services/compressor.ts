import { spawn } from 'node:child_process'
import { unlink } from 'node:fs/promises'
import path from 'node:path'

import { getMediaType, type MediaType } from '../config/file-types'
import { env } from '../env'

// mobile（APP）图片画质 80，与其他预设走同一套按输出格式换算的参数（jpg 的 -q:v、webp 的 -quality 等）。
const QUALITY_MAP: Record<string, number> = { smallest: 50, balanced: 75, highest: 90, mobile: 80 }
const CRF_MAP: Record<string, number> = { smallest: 35, balanced: 23, highest: 18 }

// WebM only accepts VP8/VP9/AV1 video and Vorbis/Opus audio; every other
// video container gets H.264 + AAC.
function isWebm(output: string): boolean {
  return path.extname(output).toLowerCase() === '.webm'
}

// libvpx-vp9 默认 cpu-used 0 且单线程行并行，10 秒 1080p 约 65 秒；
// row-mt + good/cpu-used 4 实测降到 11 秒左右，体积约增 8%。
const VP9_FAST = ['-row-mt', '1', '-deadline', 'good', '-cpu-used', '4']

// 非 yuv420p（10-bit / 4:2:2 / 4:4:4）的源直接编码，浏览器与 QuickTime 播不了。
// 代价是 HDR 源的色彩范围被压成 8-bit SDR。
const PIX_FMT = ['-pix_fmt', 'yuv420p']

// 保证宽高为偶数；libx264 / yuv420p 遇到奇数宽高会直接失败。
const EVEN_SCALE = 'scale=trunc(iw/2)*2:trunc(ih/2)*2'

// 保持原格式时，H.264 + AAC 能放进去的视频容器；其余（ogv、wmv）改输出 mp4。
const KEEPABLE_VIDEO_EXTS = new Set([
  '.mp4', '.mov', '.mkv', '.avi', '.m4v', '.webm', '.ts', '.flv', '.3gp', '.mts', '.m2ts',
])

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

export function outputFilename(
  taskId: string,
  original: string,
  format: string | undefined,
  mediaType: MediaType,
): string {
  const stem = path.basename(original, path.extname(original))
  const origExt = path.extname(original).toLowerCase()
  const keepExt = mediaType === 'video' && !KEEPABLE_VIDEO_EXTS.has(origExt) ? '.mp4' : origExt
  const ext = format && format !== 'original' && format !== ''
    ? '.' + format.toLowerCase().replace(/^\./, '')
    : keepExt
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

  if (mode === 'simple' && preset === 'mobile' && mediaType === 'video') {
    const vf = [scale ?? EVEN_SCALE, 'fps=30'].join(',')
    const video = webm
      ? ['-c:v', 'libvpx-vp9', '-crf', '23', '-b:v', '0', ...VP9_FAST]
      : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23']
    return [
      '-y', '-i', input,
      '-vf', vf,
      ...video,
      ...PIX_FMT,
      ...audioFlags(resolveAudio(options, preset), webm),
      ...(webm ? [] : ['-movflags', '+faststart']),
      output,
    ]
  }

  const cmd: string[] = ['-y', '-i', input]
  if (mediaType === 'video') cmd.push('-vf', scale ?? EVEN_SCALE)
  else if (scale) cmd.push('-vf', scale)

  if (mediaType === 'video') {
    const crf = mode === 'advanced'
      ? (options.crf as number | undefined)
      : CRF_MAP[preset] ?? 23
    cmd.push('-c:v', webm ? 'libvpx-vp9' : 'libx264', '-crf', String(crf ?? 23), ...PIX_FMT)
    if (webm) cmd.push(...VP9_FAST)
    // libvpx-vp9 needs -b:v 0 for constant-quality CRF; otherwise it caps
    // at its default target bitrate.
    if (options.bitrate) cmd.push('-b:v', String(options.bitrate))
    else if (webm) cmd.push('-b:v', '0')
    if (options.fps) cmd.push('-r', String(options.fps))
    cmd.push(...audioFlags(resolveAudio(options, preset), webm))
  } else {
    const outExt = path.extname(output).toLowerCase()
    // 动图（gif 等）转单帧格式只取首帧，否则 image2 复用同名输出会报错。
    if (['.jpg', '.jpeg', '.png', '.bmp'].includes(outExt)) cmd.push('-frames:v', '1')
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
  const outName = outputFilename(taskId, originalFilename, options.output_format as string | undefined, mediaType)
  const outPath = path.join(env.OUTPUT_DIR, outName)
  const args = buildCompressCommand(inputPath, outPath, options, mediaType)
  try {
    await runFfmpeg(args, env.FFMPEG_TIMEOUT_MS)
  } catch (e) {
    await removePartialOutput(outPath)
    throw e
  }
  return outPath
}

// 失败或超时时 ffmpeg 可能已经创建了输出文件，没有任务认领它就永远清不掉。
export async function removePartialOutput(outPath: string): Promise<void> {
  await unlink(outPath).catch(() => { /* 文件可能根本没创建 */ })
}

/** ffmpeg 失败的稳定错误码，存进任务 error 字段的前缀。 */
export class FfmpegError extends Error {
  constructor(public code: 'ffmpeg_failed' | 'ffmpeg_timeout' | 'ffmpeg_unavailable', detail: string) {
    super(`${code}: ${detail}`)
  }
}

/**
 * 把 ffmpeg 的 stderr 整理成可返回给用户的短文本：只留末尾 3 行，
 * 绝对路径缩成文件名（避免泄露服务器目录），整体不超过 400 字符。
 * 完整 stderr 由调用方写日志。
 */
export function sanitizeFfmpegError(stderr: string): string {
  const lines = stderr.split('\n').map((l) => l.trim()).filter(Boolean).slice(-3)
  return lines
    .join(' | ')
    .replace(/(?:\/[^\s'"|:]+)+/g, (p) => path.basename(p))
    .slice(0, 400)
}

export function runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // -loglevel error：stderr 里不带版本横幅和编译参数。
    const child = spawn(env.FFMPEG_PATH, ['-hide_banner', '-nostats', '-loglevel', 'error', ...args])
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.stderr.on('data', (d) => (stderr += d.toString()))
    // 等进程真正退出再 reject，调用方随后清理半成品才不会和 ffmpeg 抢文件。
    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) {
        reject(new FfmpegError('ffmpeg_timeout', `ffmpeg timed out after ${Math.round(timeoutMs / 1000)}s`))
      } else if (code === 0) {
        resolve()
      } else {
        console.error(`[ffmpeg] exited ${code}:\n${stderr.trim()}`)
        reject(new FfmpegError('ffmpeg_failed', sanitizeFfmpegError(stderr) || `ffmpeg exited ${code}`))
      }
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}
