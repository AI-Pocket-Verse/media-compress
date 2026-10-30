import path from 'node:path'

// The name shown to the user on download: original filename stem + the ACTUAL
// output extension (so a png compressed to webp downloads as photo.webp, while
// keeping-format downloads as photo.jpg). Strips the stored taskId/_compressed
// /_delogo prefix-suffix entirely. Works for any task type (compress/watermark).
export function downloadName(inputName: string, outputName: string): string {
  const stem = path.basename(inputName, path.extname(inputName))
  const ext = path.extname(outputName)
  return `${stem}${ext}`
}

// Build an RFC 6266 Content-Disposition value that survives non-ASCII (e.g.
// Chinese) names. Browsers do NOT decode percent-escapes inside a quoted
// filename="…", so we emit an ASCII fallback plus a filename*=UTF-8'' form that
// they DO decode.
export function contentDisposition(name: string): string {
  const fallback = name.replace(/[^A-Za-z0-9._-]/g, '_')
  const utf8 = encodeURIComponent(name)
  return `attachment; filename="${fallback}"; filename*=UTF-8''${utf8}`
}

// Ensure uniqueness within a set (e.g. zip entries): append " (2)", " (3)"… on
// clash. Mirrors the format the batch route used before.
export function dedupeName(name: string, used: Set<string>): string {
  if (!used.has(name)) return name
  const ext = path.extname(name)
  const base = name.slice(0, name.length - ext.length)
  let n = 2
  while (used.has(`${base} (${n})${ext}`)) n++
  return `${base} (${n})${ext}`
}
