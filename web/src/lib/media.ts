import type { MediaType } from './types'

export const IMG_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|tiff|tif|heic|heif|avif|ico)$/i
export const VID_EXT = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|ts|3gp|ogv|mts|m2ts)$/i

export const isImage = (name: string) => IMG_EXT.test(name)
export const isVideo = (name: string) => VID_EXT.test(name)

export function detectMediaType(file: File): MediaType | null {
  if ((file.type || '').startsWith('image/')) return 'image'
  if ((file.type || '').startsWith('video/')) return 'video'
  const name = file.name || ''
  if (IMG_EXT.test(name)) return 'image'
  if (VID_EXT.test(name)) return 'video'
  return null
}
