import { createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

import type { MultipartFile } from '@fastify/multipart'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { getFfmpegCapabilities } from '../config/ffmpeg-caps'
import { ALLOWED_EXTENSIONS, isAllowedExtension } from '../config/file-types'
import { env } from '../env'
import { sanitizeFilename } from '../utils/sanitize'

export class UploadError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
  }
}

// preHandler: when ffmpeg can't run, reject the upload up front instead of
// saving it and failing the task later. Replies directly because the shared
// error handler masks every 5xx message.
export async function requireFfmpeg(req: FastifyRequest, reply: FastifyReply) {
  const caps = await getFfmpegCapabilities()
  if (!caps.ffmpeg_ok) {
    // Discard the unread body before replying: answering mid-upload makes a
    // reverse proxy still streaming the body hit EPIPE and send 500/502.
    if (!req.raw.readableEnded) {
      await new Promise<void>((resolve) => {
        req.raw.once('end', resolve).once('error', () => resolve()).resume()
      })
    }
    return reply.code(503).send({
      code: 'ffmpeg_unavailable',
      message: 'ffmpeg / ffprobe cannot run on this server. Check FFMPEG_PATH / FFPROBE_PATH (see "FFmpeg requirements" in the README).',
    })
  }
}

export async function streamSaveValidated(
  file: MultipartFile,
  taskId: string,
): Promise<{ safeName: string; relPath: string; size: number }> {
  const safeName = sanitizeFilename(file.filename)
  if (!isAllowedExtension(safeName)) {
    const ext = path.extname(safeName).toLowerCase() || '(none)'
    throw new UploadError(
      400,
      `unsupported file type: ${ext}. Allowed: ${[...ALLOWED_EXTENSIONS].sort().join(', ')}`,
    )
  }

  const savedName = `${taskId.slice(0, 8)}_${safeName}`
  const savePath = path.resolve(env.UPLOAD_DIR, savedName)
  const uploadsRoot = path.resolve(env.UPLOAD_DIR)
  if (!savePath.startsWith(uploadsRoot + path.sep)) {
    throw new UploadError(400, 'invalid filename')
  }

  try {
    await pipeline(file.file, createWriteStream(savePath))
  } catch (e) {
    await unlink(savePath).catch(() => undefined)
    throw new UploadError(500, `disk write failed: ${(e as Error).message}`)
  }

  // @fastify/multipart exposes truncation when fileSize is exceeded
  if (file.file.truncated) {
    await unlink(savePath).catch(() => undefined)
    throw new UploadError(413, `file too large: max ${env.MAX_UPLOAD_BYTES} bytes`)
  }

  const size = file.file.bytesRead
  if (size === 0) {
    await unlink(savePath).catch(() => undefined)
    throw new UploadError(400, 'empty file')
  }

  return { safeName, relPath: `uploads/${savedName}`, size }
}
