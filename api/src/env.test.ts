import { describe, expect, it } from 'vitest'

import { parseTrustProxy } from './env'

describe('parseTrustProxy', () => {
  it('留空按 loopback，true / false 转布尔，地址列表原样保留', () => {
    expect(parseTrustProxy('  ')).toBe('loopback')
    expect(parseTrustProxy('TRUE')).toBe(true)
    expect(parseTrustProxy('false')).toBe(false)
    expect(parseTrustProxy('127.0.0.1,10.0.0.0/8')).toBe('127.0.0.1,10.0.0.0/8')
  })
  it('跳数直接报错：Fastify 5.12 起跳数会静默不信任任何代理', () => {
    expect(() => parseTrustProxy('1')).toThrow(/hop count/)
  })
})
