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
