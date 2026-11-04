import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'

import { hostGuard, parseAllowedHosts } from './host-guard'

async function build(allowed: string) {
  const app = Fastify()
  app.addHook('onRequest', hostGuard(parseAllowedHosts(allowed)))
  app.get('/api/files', async () => ({ ok: true }))
  app.post('/api/upload', async () => ({ ok: true }))
  return app
}

describe('本地模式 Host / Origin 校验', () => {
  it('默认放行 localhost / 127.0.0.1 / [::1]，端口不限', async () => {
    const app = await build('')
    for (const host of ['localhost:5010', '127.0.0.1:4010', '[::1]:4010', 'LOCALHOST']) {
      const res = await app.inject({ url: '/api/files', headers: { host } })
      expect(res.statusCode, host).toBe(200)
    }
  })

  it('DNS 重绑定：Host 是外部域名 → 403 host_not_allowed', async () => {
    const app = await build('')
    const res = await app.inject({ url: '/api/files', headers: { host: 'evil.example.com' } })
    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('host_not_allowed')
  })

  it('跨站请求：Host 合法但 Origin 是外部站点 → 403', async () => {
    const app = await build('')
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      headers: { host: '127.0.0.1:4010', origin: 'https://evil.example.com' },
    })
    expect(res.statusCode).toBe(403)
    const nullOrigin = await app.inject({ method: 'POST', url: '/api/upload', headers: { host: 'localhost', origin: 'null' } })
    expect(nullOrigin.statusCode).toBe(403)
  })

  it('同源页面（Vite 代理把 Host 改成 api 地址、Origin 是前端端口）放行', async () => {
    const app = await build('')
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      headers: { host: 'localhost:4010', origin: 'http://localhost:5010' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('ALLOWED_HOSTS 追加局域网地址或域名；* 关闭校验', async () => {
    const lan = await build('192.168.1.20, Media.Example.com')
    expect((await lan.inject({ url: '/api/files', headers: { host: '192.168.1.20:8080' } })).statusCode).toBe(200)
    expect((await lan.inject({ url: '/api/files', headers: { host: 'media.example.com' } })).statusCode).toBe(200)
    expect((await lan.inject({ url: '/api/files', headers: { host: 'other.example.com' } })).statusCode).toBe(403)
    const any = await build('*')
    expect((await any.inject({ url: '/api/files', headers: { host: 'other.example.com' } })).statusCode).toBe(200)
  })
})
