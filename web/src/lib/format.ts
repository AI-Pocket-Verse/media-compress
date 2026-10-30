import type { ProbeMeta } from './types'

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let n = Number(bytes)
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return ''
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`
}

export function formatBitrate(bps: number | null | undefined): string {
  if (bps == null || bps <= 0) return ''
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`
  if (bps >= 1_000) return `${Math.round(bps / 1_000)} kbps`
  return `${bps} bps`
}

export function formatMediaInfo(meta: ProbeMeta | null | undefined): string {
  if (!meta) return ''
  const parts: string[] = []
  const v = meta.video
  const a = meta.audio
  if (v?.width && v?.height) parts.push(`${v.width}×${v.height}`)
  if (meta.duration_sec) parts.push(formatDuration(meta.duration_sec))
  if (v?.fps) parts.push(`${v.fps} fps`)
  if (v?.codec) parts.push(`vid: ${v.codec}`)
  if (a?.codec) parts.push(`aud: ${a.codec}`)
  if (meta.bit_rate) parts.push(formatBitrate(meta.bit_rate))
  return parts.join(' · ')
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  // 固定北京时间展示,与运行环境/访问者时区无关。
  try { return new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) } catch { return String(iso) }
}

export function escapeHtml(str: unknown): string {
  return String(str ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c),
  )
}
