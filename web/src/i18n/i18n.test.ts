import { describe, expect, it } from 'vitest'

import { detectLang, translate } from './index'
import { en, zh } from './messages'

describe('detectLang', () => {
  it('浏览器首选语言是中文（含繁体、地区变体）→ zh', () => {
    expect(detectLang(['zh-CN', 'en'])).toBe('zh')
    expect(detectLang(['zh-TW'])).toBe('zh')
    expect(detectLang(['ZH'])).toBe('zh')
  })
  it('其他语言或取不到 → en；只看首选语言', () => {
    expect(detectLang(['en-US', 'zh-CN'])).toBe('en')
    expect(detectLang(['ja'])).toBe('en')
    expect(detectLang([])).toBe('en')
  })
})

describe('translate', () => {
  it('插值；未提供的占位原样保留', () => {
    expect(translate('zh', 'compress.start', { n: 3 })).toBe('开始压缩（3 个）')
    expect(translate('en', 'compress.uploadFailed', { name: 'a.png' })).toBe('Upload failed (a.png): {error}')
  })
  it('英文 n === 1 用单数形式，中文不受影响', () => {
    expect(translate('en', 'queue.fileCount', { n: 1 })).toBe('1 file')
    expect(translate('en', 'queue.fileCount', { n: 2 })).toBe('2 files')
    expect(translate('zh', 'queue.fileCount', { n: 1 })).toBe('1 个文件')
  })
  it('英文词典没有多出中文没有的 key，也没有残留中文', () => {
    const zhKeys = new Set(Object.keys(zh))
    for (const k of Object.keys(en)) expect(zhKeys.has(k.replace(/_one$/, '')), k).toBe(true)
    for (const [k, v] of Object.entries(en)) expect(/[一-鿿]/.test(v), k).toBe(false)
  })
})
