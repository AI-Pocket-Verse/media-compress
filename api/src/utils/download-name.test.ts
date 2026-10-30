import { describe, expect, it } from 'vitest'

import { contentDisposition, dedupeName, downloadName } from './download-name'

describe('downloadName', () => {
  it('keeps the original name when format is unchanged', () => {
    expect(downloadName('photo.jpg', '207dc8e2_photo_compressed.jpg')).toBe('photo.jpg')
  })
  it('uses the original stem + actual output extension when format changed', () => {
    expect(downloadName('photo.png', '207dc8e2_photo_compressed.webp')).toBe('photo.webp')
  })
  it('preserves a multi-dot stem', () => {
    expect(downloadName('a.b.c.png', 'id_a.b.c_compressed.png')).toBe('a.b.c.png')
  })
  it('works for watermark (_delogo) outputs too', () => {
    expect(downloadName('photo.png', 'id_photo_delogo.png')).toBe('photo.png')
  })
})

describe('dedupeName', () => {
  it('returns the name unchanged when unused', () => {
    expect(dedupeName('photo.jpg', new Set())).toBe('photo.jpg')
  })
  it('appends " (2)" on first collision', () => {
    expect(dedupeName('photo.jpg', new Set(['photo.jpg']))).toBe('photo (2).jpg')
  })
  it('appends " (3)" when (2) is also taken', () => {
    expect(dedupeName('photo.jpg', new Set(['photo.jpg', 'photo (2).jpg']))).toBe('photo (3).jpg')
  })
})

describe('contentDisposition', () => {
  it('keeps an ASCII name verbatim in both forms', () => {
    expect(contentDisposition('photo.jpg')).toBe(
      "attachment; filename=\"photo.jpg\"; filename*=UTF-8''photo.jpg",
    )
  })
  it('gives an ASCII fallback + UTF-8 form for non-ASCII (Chinese) names', () => {
    expect(contentDisposition('照片.webp')).toBe(
      "attachment; filename=\"__.webp\"; filename*=UTF-8''%E7%85%A7%E7%89%87.webp",
    )
  })
})
