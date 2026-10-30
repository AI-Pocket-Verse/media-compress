import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

import Fastify from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// env.ts reads FFMPEG_PATH / FFPROBE_PATH at import time, so each case stubs
// the env and re-imports the real modules.
let dir: string
const script = async (name: string, body: string) => {
  const p = path.join(dir, name)
  await writeFile(p, `#!/bin/sh\n${body}\n`)
  await chmod(p, 0o755)
  return p
}

beforeAll(async () => { dir = await mkdtemp(path.join(tmpdir(), 'ffmpeg-caps-')) })
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

async function load(ffmpeg: string, ffprobe: string) {
  vi.stubEnv('FFMPEG_PATH', ffmpeg)
  vi.stubEnv('FFPROBE_PATH', ffprobe)
  vi.resetModules()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const caps = await import('./ffmpeg-caps')
  const { requireFfmpeg } = await import('../routes/_helpers')
  const app = Fastify()
  app.post('/upload', { preHandler: requireFfmpeg }, async () => ({ ok: true }))
  return { caps: await caps.getFfmpegCapabilities(true), app }
}

describe('ffmpeg availability gate', () => {
  it('missing binary → unavailable, upload rejected with 503 ffmpeg_unavailable', async () => {
    const { caps, app } = await load(path.join(dir, 'nope'), path.join(dir, 'nope'))
    expect(caps.ffmpeg_ok).toBe(false)
    const res = await app.inject({ method: 'POST', url: '/upload' })
    expect(res.statusCode).toBe(503)
    expect(res.json().code).toBe('ffmpeg_unavailable')
  })

  // Replying before the upload body is read races the client: reverse
  // proxies (vite, nginx) that are still streaming the upload hit EPIPE and
  // turn the 503 into a 500/502. The gate must drain the body first.
  it('large upload: 503 arrives only after the whole body was sent', async () => {
    const { app } = await load(path.join(dir, 'nope'), path.join(dir, 'nope'))
    await app.register(import('@fastify/multipart'))
    await app.listen({ port: 0, host: '127.0.0.1' })
    try {
      const { port } = app.server.address() as AddressInfo
      const events: string[] = []
      const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = request(
          { host: '127.0.0.1', port, method: 'POST', path: '/upload', headers: { 'content-type': 'multipart/form-data; boundary=x' } },
          (r) => {
            events.push('response')
            let body = ''
            r.on('data', (d) => (body += d))
            r.on('end', () => resolve({ status: r.statusCode!, body }))
          },
        )
        req.on('error', reject)
        req.on('finish', () => events.push('body-sent'))
        req.write('--x\r\nContent-Disposition: form-data; name="file"; filename="a.mp4"\r\n\r\n')
        // Stream the body slowly, the way a proxy forwards an upload.
        const chunk = Buffer.alloc(256 * 1024)
        let left = 8
        const pump = () => {
          if (left-- > 0) req.write(chunk, () => setTimeout(pump, 20))
          else req.end('\r\n--x--\r\n')
        }
        pump()
      })
      expect(events).toEqual(['body-sent', 'response'])
      expect(result.status).toBe(503)
      expect(JSON.parse(result.body).code).toBe('ffmpeg_unavailable')
    } finally {
      await app.close()
    }
  })

  it('broken install (spawns but exits non-zero) → unavailable, not "no encoders"', async () => {
    const broken = await script('broken', 'echo "dyld: Library not loaded: libx265.dylib" >&2; exit 134')
    const probe = await script('probe-ok', 'exit 0')
    const { caps, app } = await load(broken, probe)
    expect(caps.ffmpeg_ok).toBe(false)
    expect((await app.inject({ method: 'POST', url: '/upload' })).statusCode).toBe(503)
  })

  it('broken ffprobe alone → unavailable', async () => {
    const ffmpeg = await script('ffmpeg-ok', 'echo " V....D libx264  H.264"; exit 0')
    const probe = await script('probe-broken', 'exit 1')
    const { caps } = await load(ffmpeg, probe)
    expect(caps.ffmpeg_ok).toBe(false)
    expect(caps.libx264).toBe(false)
  })

  it('working install → available, encoders detected, upload passes the gate', async () => {
    const ffmpeg = await script('ffmpeg-full', 'echo " V....D libx264  H.264"; echo " V....D libwebp  WebP"; exit 0')
    const probe = await script('probe-ok2', 'exit 0')
    const { caps, app } = await load(ffmpeg, probe)
    expect(caps).toMatchObject({ ffmpeg_ok: true, libx264: true, webp: true, libvpx_vp9: false })
    const res = await app.inject({ method: 'POST', url: '/upload' })
    expect(res.statusCode).toBe(200)
  })
})
