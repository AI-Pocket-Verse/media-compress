import path from 'node:path'

// Allow ASCII alnum + `._-` AND all Unicode letters/numbers (Chinese, kana,
// accented latin, emoji-as-letter etc.). Strips path separators, control
// chars, and shell-special characters but keeps the filename human-readable.
const ALLOWED = /[\p{L}\p{N}._\-]/u

export function sanitizeFilename(name: string | undefined | null): string {
  if (!name) return 'unnamed'
  const base = path.basename(name)
  if (!base) return 'unnamed'
  const safeChars = Array.from(base, (c) => (ALLOWED.test(c) ? c : '_')).join('')
  const trimmed = safeChars.replace(/^\.+/, '') || 'unnamed'
  return trimmed.slice(0, 200)
}
