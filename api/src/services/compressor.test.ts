import { describe, expect, it } from 'vitest'

import { buildCompressCommand, resolveWH, scaleFilter } from './compressor'

describe('resolveWH', () => {
  it('returns null for keep-original', () => {
    expect(resolveWH('')).toBeNull()
    expect(resolveWH(null)).toBeNull()
    expect(resolveWH('original')).toBeNull()
  })
  it('parses WxH', () => {
    expect(resolveWH('1920x1080')).toEqual({ w: 1920, h: 1080 })
    expect(resolveWH('2048x2048')).toEqual({ w: 2048, h: 2048 })
  })
  it('maps legacy presets', () => {
    expect(resolveWH('1080p')).toEqual({ w: 1920, h: 1080 })
    expect(resolveWH('720p')).toEqual({ w: 1280, h: 720 })
  })
  it('returns null for garbage', () => {
    expect(resolveWH('abc')).toBeNull()
    expect(resolveWH('1920X')).toBeNull()
  })
})

describe('scaleFilter', () => {
  it('returns null for keep-original', () => {
    expect(scaleFilter('', 'video')).toBeNull()
    expect(scaleFilter('original', 'image')).toBeNull()
  })
  it('builds a fit-within no-upscale filter for images', () => {
    expect(scaleFilter('1920x1080', 'image')).toBe(
      "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease",
    )
  })
  it('adds force_divisible_by=2 for video (even dimensions)', () => {
    expect(scaleFilter('1080x1920', 'video')).toBe(
      "scale=w='min(1080,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    )
  })
})

describe('buildCompressCommand resolution', () => {
  const vf = (args: string[]) => {
    const i = args.indexOf('-vf')
    return i === -1 ? null : args[i + 1]
  }

  it('omits -vf when resolution is keep-original (non-mobile)', () => {
    const args = buildCompressCommand('in.mp4', 'out.mp4', { mode: 'simple', quality_preset: 'balanced' }, 'video')
    expect(args).not.toContain('-vf')
  })
  it('applies unified fit-within scale for video (even)', () => {
    const args = buildCompressCommand('in.mp4', 'out.mp4', { mode: 'simple', quality_preset: 'balanced', resolution: '1920x1080' }, 'video')
    expect(vf(args)).toBe("scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2")
  })
  it('applies fit-within scale for image (no force_divisible_by)', () => {
    const args = buildCompressCommand('in.png', 'out.png', { mode: 'simple', quality_preset: 'balanced', resolution: '2048x2048' }, 'image')
    expect(vf(args)).toBe("scale=w='min(2048,iw)':h='min(2048,ih)':force_original_aspect_ratio=decrease")
  })

  // Behavior change: APP(mobile) no longer auto-downscales when keep-original.
  it('mobile + keep-original (video): fps=30 only, no scale; keeps crf/faststart', () => {
    const args = buildCompressCommand('in.mp4', 'out.mp4', { mode: 'simple', quality_preset: 'mobile' }, 'video')
    expect(vf(args)).toBe('fps=30')
    expect(args).toContain('-crf')
    expect(args).toContain('23')
    expect(args).toContain('+faststart')
  })
  it('mobile + resolution (video): unified scale + fps=30', () => {
    const args = buildCompressCommand('in.mp4', 'out.mp4', { mode: 'simple', quality_preset: 'mobile', resolution: '1280x720' }, 'video')
    expect(vf(args)).toBe("scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30")
  })
  it('video → mp4 keeps H.264 + AAC', () => {
    const args = buildCompressCommand('in.mp4', 'out.mp4', { mode: 'simple', quality_preset: 'balanced' }, 'video')
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-c:a', 'aac']))
  })
  // WebM only accepts VP8/VP9/AV1 video and Vorbis/Opus audio.
  it('video → webm uses VP9 constant quality + Opus', () => {
    const args = buildCompressCommand('in.mp4', 'out.webm', { mode: 'advanced', crf: 28 }, 'video')
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'libvpx-vp9', '-crf', '28', '-b:v', '0', '-c:a', 'libopus']))
    expect(args).not.toContain('libx264')
    expect(args).not.toContain('aac')
  })
  it('video → webm with explicit bitrate does not force -b:v 0', () => {
    const args = buildCompressCommand('in.mp4', 'out.webm', { mode: 'advanced', crf: 28, bitrate: '2M' }, 'video')
    expect(args[args.indexOf('-b:v') + 1]).toBe('2M')
    expect(args.filter((a) => a === '-b:v')).toHaveLength(1)
  })
  it('video → webm with audio copy re-encodes to Opus (AAC cannot go into WebM)', () => {
    const args = buildCompressCommand('in.mp4', 'out.webm', { mode: 'advanced', crf: 28, audio: 'copy' }, 'video')
    expect(args[args.indexOf('-c:a') + 1]).toBe('libopus')
  })
  it('video → mp4 with audio copy keeps copy', () => {
    const args = buildCompressCommand('in.mp4', 'out.mp4', { mode: 'advanced', crf: 28, audio: 'copy' }, 'video')
    expect(args[args.indexOf('-c:a') + 1]).toBe('copy')
  })
  it('mobile + webm: VP9 + Opus, no mp4-only flags', () => {
    const args = buildCompressCommand('in.mp4', 'out.webm', { mode: 'simple', quality_preset: 'mobile' }, 'video')
    expect(args).toContain('libvpx-vp9')
    expect(args).not.toContain('libx264')
    expect(args).not.toContain('-preset')
    expect(args).not.toContain('+faststart')
  })
  it('mobile + keep-original (image): no scale, quality 80', () => {
    const args = buildCompressCommand('in.png', 'out.png', { mode: 'simple', quality_preset: 'mobile' }, 'image')
    expect(args).not.toContain('-vf')
    expect(args).toContain('-quality')
    expect(args).toContain('80')
  })
})
