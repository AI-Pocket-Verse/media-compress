import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// 真实 ffmpeg 生成缩略图；本机没有 ffmpeg 时跳过。
const has = spawnSync('ffmpeg', ['-version']).status === 0

describe.skipIf(!has)('generateThumbnail() 真实 ffmpeg', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'thumb-'))
    vi.stubEnv('THUMBNAIL_DIR', dir)
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    await rm(dir, { recursive: true, force: true })
  })

  it('多帧 GIF 只取首帧，能生成缩略图', async () => {
    const gif = path.join(dir, 'anim.gif')
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=10', '-t', '1', gif])
    vi.resetModules()
    const { generateThumbnail } = await import('./thumbnail')
    expect(await generateThumbnail(gif, '00000000-gif')).not.toBeNull()
  })
})
