import { describe, expect, it } from 'vitest'

import { buildCompressCommand, outputFilename, resolveWH, sanitizeFfmpegError, scaleFilter } from './compressor'

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

  it('omits -vf when resolution is keep-original (image)', () => {
    const args = buildCompressCommand('in.png', 'out.png', { mode: 'simple', quality_preset: 'balanced' }, 'image')
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
  it('mobile + keep-original (video): 只补偶数滤镜 + fps=30，不缩放；keeps crf/faststart', () => {
    const args = buildCompressCommand('in.mp4', 'out.mp4', { mode: 'simple', quality_preset: 'mobile' }, 'video')
    expect(vf(args)).toBe('scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30')
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
  it('mobile + webp (image): no scale, quality 80', () => {
    const args = buildCompressCommand('in.png', 'out.webp', { mode: 'simple', quality_preset: 'mobile' }, 'image')
    expect(args).not.toContain('-vf')
    expect(args).toEqual(expect.arrayContaining(['-quality', '80']))
  })
  // 服务器缺 libwebp 时 APP 退回 jpg：画质 80 要换算成 jpg 的 -q:v，动图只取首帧。
  it('mobile + jpg (image): q:v 按画质 80 换算，动图只取首帧', () => {
    const args = buildCompressCommand('in.gif', 'out.jpg', { mode: 'simple', quality_preset: 'mobile' }, 'image')
    expect(args).toEqual(expect.arrayContaining(['-frames:v', '1', '-q:v', '8']))
  })
})

// VP9 默认 cpu-used 0 极慢（10 秒 1080p 约 65 秒），必须带速度参数。
describe('VP9 speed flags', () => {
  const expectFast = (args: string[]) => {
    expect(args).toEqual(expect.arrayContaining(['-row-mt', '1', '-deadline', 'good', '-cpu-used', '4']))
    expect(args[args.indexOf('-row-mt') + 1]).toBe('1')
    expect(args[args.indexOf('-deadline') + 1]).toBe('good')
    expect(args[args.indexOf('-cpu-used') + 1]).toBe('4')
  }
  it('普通分支 webm 带速度参数', () => {
    expectFast(buildCompressCommand('in.mp4', 'out.webm', { mode: 'simple', quality_preset: 'balanced' }, 'video'))
  })
  it('高级模式 + 显式码率 webm 也带速度参数', () => {
    expectFast(buildCompressCommand('in.mp4', 'out.webm', { mode: 'advanced', crf: 28, bitrate: '2M' }, 'video'))
  })
  it('移动端预设 webm 带速度参数', () => {
    expectFast(buildCompressCommand('in.mp4', 'out.webm', { mode: 'simple', quality_preset: 'mobile' }, 'video'))
  })
  it('mp4 不带 VP9 参数', () => {
    const args = buildCompressCommand('in.mp4', 'out.mp4', { mode: 'simple', quality_preset: 'balanced' }, 'video')
    expect(args).not.toContain('-row-mt')
    expect(args).not.toContain('-cpu-used')
  })
})

describe('视频输出兼容性', () => {
  const vf = (args: string[]) => args[args.indexOf('-vf') + 1]
  it('不选分辨率时仍补偶数宽高滤镜（奇数宽高 libx264 会失败）', () => {
    const args = buildCompressCommand('in.mov', 'out.mp4', { mode: 'simple', quality_preset: 'balanced' }, 'video')
    expect(vf(args)).toBe('scale=trunc(iw/2)*2:trunc(ih/2)*2')
  })
  it('移动端预设不选分辨率：偶数滤镜 + fps=30', () => {
    const args = buildCompressCommand('in.mov', 'out.mp4', { mode: 'simple', quality_preset: 'mobile' }, 'video')
    expect(vf(args)).toBe('scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30')
  })
  it('视频输出统一 yuv420p（10-bit / 4:2:2 源浏览器播不了）', () => {
    for (const out of ['out.mp4', 'out.webm']) {
      for (const preset of ['balanced', 'mobile']) {
        const args = buildCompressCommand('in.mov', out, { mode: 'simple', quality_preset: preset }, 'video')
        expect(args[args.indexOf('-pix_fmt') + 1]).toBe('yuv420p')
      }
    }
  })
  it('图片不加偶数滤镜和 pix_fmt', () => {
    const args = buildCompressCommand('in.png', 'out.png', { mode: 'simple', quality_preset: 'balanced' }, 'image')
    expect(args).not.toContain('-vf')
    expect(args).not.toContain('-pix_fmt')
  })
  it('动图转 jpg / png / bmp 只取首帧', () => {
    for (const ext of ['jpg', 'png', 'bmp']) {
      const args = buildCompressCommand('in.gif', `out.${ext}`, { mode: 'simple', quality_preset: 'balanced' }, 'image')
      expect(args.slice(args.indexOf('-frames:v'), args.indexOf('-frames:v') + 2)).toEqual(['-frames:v', '1'])
    }
    const gif = buildCompressCommand('in.gif', 'out.gif', { mode: 'simple', quality_preset: 'balanced' }, 'image')
    expect(gif).not.toContain('-frames:v')
  })
})

describe('outputFilename', () => {
  it('ogv / wmv 保持原格式时改输出 mp4（H.264 放不进这些容器）', () => {
    expect(outputFilename('abcdef123456', 'clip.ogv', undefined, 'video')).toBe('abcdef12_clip_compressed.mp4')
    expect(outputFilename('abcdef123456', 'clip.wmv', undefined, 'video')).toBe('abcdef12_clip_compressed.mp4')
  })
  it('其余格式保持原扩展名', () => {
    expect(outputFilename('abcdef123456', 'clip.mov', undefined, 'video')).toBe('abcdef12_clip_compressed.mov')
    expect(outputFilename('abcdef123456', 'p.png', undefined, 'image')).toBe('abcdef12_p_compressed.png')
  })
  it('显式指定格式优先', () => {
    expect(outputFilename('abcdef123456', 'clip.ogv', 'webm', 'video')).toBe('abcdef12_clip_compressed.webm')
  })
})

describe('sanitizeFfmpegError', () => {
  const stderr = [
    'ffmpeg version 9.0.2 Copyright (c) 2000-2026 the FFmpeg developers',
    '  configuration: --prefix=/usr/local/Cellar/ffmpeg/9.0.2',
    '[in#0 @ 0x1] Error opening input: /srv/app/data/uploads/4fca16f4_garbage.mp4',
    'Error opening input files: Invalid data found when processing input',
    'Conversion failed!',
  ].join('\n')
  it('只保留末尾几行，且不含绝对路径与编译参数', () => {
    const out = sanitizeFfmpegError(stderr)
    expect(out).not.toContain('/srv/app')
    expect(out).not.toContain('/usr/local')
    expect(out).not.toContain('configuration')
    expect(out).toContain('4fca16f4_garbage.mp4')
    expect(out).toContain('Invalid data found')
  })
})
