import path from 'node:path'

export const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp',
  '.tiff', '.tif', '.heic', '.heif', '.avif', '.ico',
])

export const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv',
  '.wmv', '.ts', '.m4v', '.3gp', '.ogv', '.mts', '.m2ts',
])

export const ALLOWED_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS])

export const ALLOWED_OUTPUT_FORMATS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp',
  'mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v',
])

// 输出格式按媒体类型分组：视频不能输出成图片格式，图片也不能输出成视频容器。
export const IMAGE_OUTPUT_FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'])
export const VIDEO_OUTPUT_FORMATS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v'])

export type MediaType = 'image' | 'video'

// 上传文件的 MIME 按扩展名在服务端决定，不信任客户端声明的 Content-Type：
// /api/input 原样回传原文件，客户端可控的类型（如 text/html）会让浏览器把它当网页执行。
const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.bmp': 'image/bmp', '.tiff': 'image/tiff', '.tif': 'image/tiff',
  '.heic': 'image/heic', '.heif': 'image/heif', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
  '.webm': 'video/webm', '.flv': 'video/x-flv', '.wmv': 'video/x-ms-wmv', '.ts': 'video/mp2t',
  '.m4v': 'video/x-m4v', '.3gp': 'video/3gpp', '.ogv': 'video/ogg', '.mts': 'video/mp2t', '.m2ts': 'video/mp2t',
}

export function mimeForFilename(filename: string): string {
  return MIME_BY_EXT[path.extname(filename).toLowerCase()] ?? 'application/octet-stream'
}

export function getMediaType(filename: string): MediaType {
  const ext = path.extname(filename).toLowerCase()
  return IMAGE_EXTENSIONS.has(ext) ? 'image' : 'video'
}

export function isAllowedExtension(filename: string): boolean {
  return ALLOWED_EXTENSIONS.has(path.extname(filename).toLowerCase())
}

/** 输出格式是否适用于该媒体类型；未指定格式（保持原格式）恒为 true。 */
export function isOutputFormatCompatible(mediaType: MediaType, format: string | undefined): boolean {
  if (!format) return true
  return (mediaType === 'image' ? IMAGE_OUTPUT_FORMATS : VIDEO_OUTPUT_FORMATS).has(format)
}
