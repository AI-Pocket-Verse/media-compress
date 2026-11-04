import { describe, expect, it } from 'vitest'

import { mimeForFilename } from './file-types'

describe('mimeForFilename', () => {
  it('按扩展名决定类型，大小写不敏感', () => {
    expect(mimeForFilename('a.JPG')).toBe('image/jpeg')
    expect(mimeForFilename('clip.mov')).toBe('video/quicktime')
    expect(mimeForFilename('clip.m2ts')).toBe('video/mp2t')
  })
  it('未知扩展名回退 application/octet-stream，不会给出可执行的网页类型', () => {
    expect(mimeForFilename('x.html')).toBe('application/octet-stream')
    expect(mimeForFilename('noext')).toBe('application/octet-stream')
  })
})
