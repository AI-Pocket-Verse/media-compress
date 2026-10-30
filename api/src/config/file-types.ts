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

export type MediaType = 'image' | 'video'

export function getMediaType(filename: string): MediaType {
  const ext = path.extname(filename).toLowerCase()
  return IMAGE_EXTENSIONS.has(ext) ? 'image' : 'video'
}

export function isAllowedExtension(filename: string): boolean {
  return ALLOWED_EXTENSIONS.has(path.extname(filename).toLowerCase())
}
