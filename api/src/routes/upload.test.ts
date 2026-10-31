import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import multipart from '@fastify/multipart'
import Fastify from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// 输出格式与媒体类型的交叉校验发生在落盘和入库之前，
// 这里用假 ffmpeg 通过能力检测，走真实的 /api/upload 路由。
let dir: string
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'upload-route-'))
  const fake = path.join(dir, 'fake-ffmpeg')
  await writeFile(fake, '#!/bin/sh\necho " V..... libx264 libvpx-vp9 mjpeg png gif"\n')
  await chmod(fake, 0o755)
  vi.stubEnv('FFMPEG_PATH', fake)
  vi.stubEnv('FFPROBE_PATH', fake)
})
afterAll(async () => {
  vi.unstubAllEnvs()
  await rm(dir, { recursive: true, force: true })
})
afterEach(() => vi.restoreAllMocks())

async function upload(filename: string, options: Record<string, unknown>) {
  vi.resetModules()
  const { uploadRoutes } = await import('./upload')
  const { default: authPlugin } = await import('@media-compress/auth-client-api')
  const app = Fastify()
  await app.register(multipart)
  await app.register(authPlugin, {})
  await app.register(uploadRoutes)
  const b = '----t'
  const body =
    `--${b}\r\nContent-Disposition: form-data; name="options"\r\n\r\n${JSON.stringify(options)}\r\n` +
    `--${b}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\nxxxx\r\n` +
    `--${b}--\r\n`
  return app.inject({
    method: 'POST',
    url: '/api/upload',
    headers: { 'content-type': `multipart/form-data; boundary=${b}` },
    payload: body,
  })
}

describe('POST /api/upload 输出格式与媒体类型交叉校验', () => {
  it('视频 → jpg 返回 400 unsupported_format', async () => {
    const res = await upload('clip.mp4', { output_format: 'jpg' })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('unsupported_format')
  })
  it('视频 → gif 返回 400 unsupported_format', async () => {
    const res = await upload('clip.mov', { output_format: 'gif' })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('unsupported_format')
  })
  it('图片 → mp4 返回 400 unsupported_format', async () => {
    const res = await upload('p.png', { output_format: 'mp4' })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('unsupported_format')
  })
})
