import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// 真实 ffmpeg 转码：覆盖只靠参数数组断言测不到的问题（奇数宽高、像素格式、
// 容器与编码器、失败残留）。本机没有 ffmpeg / libx264 / libvpx-vp9 时整组跳过。
const has = (() => {
  try {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' })
    return r.status === 0 && r.stdout.includes('libx264') && r.stdout.includes('libvpx-vp9')
  } catch { return false }
})()

let dir: string
const gen = (name: string, args: string[]) => {
  const p = path.join(dir, name)
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args, p])
  return p
}
const probe = (p: string) => JSON.parse(execFileSync('ffprobe', [
  '-v', 'error', '-show_entries', 'stream=codec_name,width,height,pix_fmt', '-of', 'json', p,
], { encoding: 'utf8' })).streams[0] as { codec_name: string; width: number; height: number; pix_fmt: string }

describe.skipIf(!has)('compress() 真实 ffmpeg 转码', () => {
  let compress: typeof import('./compressor').compress
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'compress-real-'))
    await mkdir(path.join(dir, 'outputs'))
    vi.stubEnv('BASE_DIR', dir)
    vi.stubEnv('OUTPUT_DIR', path.join(dir, 'outputs'))
    vi.resetModules()
    ;({ compress } = await import('./compressor'))
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    await rm(dir, { recursive: true, force: true })
  })

  it('奇数宽高（321x241）不选分辨率也能转 mp4，输出为偶数宽高', async () => {
    const src = gen('odd.mkv', ['-f', 'lavfi', '-i', 'color=c=blue:s=321x241:r=25:d=1', '-c:v', 'ffv1'])
    const out = await compress(src, { mode: 'simple', quality_preset: 'balanced', output_format: 'mp4' }, 'aaaaaaaa-1', 'odd.mkv')
    expect(probe(src).width).toBe(321) // 确认夹具确实是奇数宽高
    const s = probe(out)
    expect(s.width % 2).toBe(0)
    expect(s.height % 2).toBe(0)
  })

  it('10-bit 源输出 yuv420p 的 H.264 / VP9（含移动端预设）', async () => {
    const src = gen('ten.mkv', ['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25:duration=1', '-pix_fmt', 'yuv420p10le', '-c:v', 'ffv1'])
    for (const [i, [fmt, preset]] of ([['mp4', 'balanced'], ['webm', 'balanced'], ['mp4', 'mobile'], ['webm', 'mobile']] as const).entries()) {
      const out = await compress(src, { mode: 'simple', quality_preset: preset, output_format: fmt }, `bbbbbbb${i}-1`, 'ten.mkv')
      expect(probe(out).pix_fmt).toBe('yuv420p')
    }
  })

  it('动图 gif 转 jpg 成功（只取首帧）', async () => {
    const src = gen('anim.gif', ['-f', 'lavfi', '-i', 'testsrc2=size=64x64:rate=5:duration=1'])
    const out = await compress(src, { mode: 'simple', quality_preset: 'balanced', output_format: 'jpg' }, 'cccccccc-1', 'anim.gif')
    expect(existsSync(out)).toBe(true)
  })

  it('失败后不留下半成品输出文件，错误信息不含绝对路径', async () => {
    const bad = path.join(dir, 'garbage.mp4')
    await writeFile(bad, Buffer.alloc(2048, 7))
    let err: Error | undefined
    await compress(bad, { mode: 'simple', quality_preset: 'balanced' }, 'dddddddd-1', 'garbage.mp4').catch((e) => { err = e })
    expect(err?.message).toMatch(/^ffmpeg_failed: /)
    expect(err?.message).not.toContain(dir)
    expect((await readdir(path.join(dir, 'outputs'))).filter((f) => f.startsWith('dddddddd'))).toEqual([])
  })
})
