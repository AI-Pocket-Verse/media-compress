import type { FastifyReply, FastifyRequest } from 'fastify'

// 本地单用户模式没有登录，只靠「只有本机能访问」保护文件。这还挡不住两类攻击：
//   - DNS 重绑定：恶意网页把自己的域名解析到 127.0.0.1，同源读取、删除用户文件，此时 Host 是攻击者域名；
//   - 跨站请求：恶意网页直接向 127.0.0.1 发表单上传，此时 Origin 是攻击者站点。
// 所以 Host 和 Origin（有则校验）的主机名都必须在白名单里。只比主机名不比端口：
// Vite 代理会把 Host 改成 api 端口，而 Origin 仍是前端端口。
const DEFAULT_HOSTS = ['localhost', '127.0.0.1', '[::1]']

/** ALLOWED_HOSTS：逗号分隔的主机名（不带端口），追加在默认值之后；`*` 表示不校验。 */
export function parseAllowedHosts(raw: string): Set<string> | null {
  const extra = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (extra.includes('*')) return null
  return new Set([...DEFAULT_HOSTS, ...extra])
}

function hostnameOf(value: string, withScheme: boolean): string | null {
  try {
    return new URL(withScheme ? value : `http://${value}`).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function hostGuard(allowed: Set<string> | null) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!allowed) return
    const host = hostnameOf(req.headers.host ?? '', false)
    const origin = req.headers.origin
    const originOk = origin === undefined || allowed.has(hostnameOf(origin, true) ?? '')
    if (host && allowed.has(host) && originOk) return
    return reply.code(403).send({
      code: 'host_not_allowed',
      message: 'local mode only accepts requests from this machine; add the host name to ALLOWED_HOSTS to allow it',
    })
  }
}
