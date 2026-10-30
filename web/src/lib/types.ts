export type TaskStatus = 'pending' | 'processing' | 'done' | 'failed'
export type TaskKind = 'compress' | 'watermark'

export interface FileInfoLite {
  filename: string
  path: string
  size: number
  mime: string
  metadata?: ProbeMeta | null
}

export interface ProbeMeta {
  format_name?: string | null
  duration_sec?: number | null
  bit_rate?: number | null
  video?: { codec?: string | null; width?: number | null; height?: number | null; fps?: number | null; bit_rate?: number | null }
  audio?: { codec?: string | null; channels?: number | null; sample_rate?: number | null; bit_rate?: number | null }
}

export interface OutputInfoLite {
  filename: string
  path: string
  size: number
  /** ffprobe payload — same shape as input.metadata. */
  metadata?: unknown
}

export interface Region {
  x: number
  y: number
  w: number
  h: number
}

export interface Task {
  id: string
  type: TaskKind
  status: TaskStatus
  created_at: string
  updated_at: string
  last_accessed_at: string
  input: FileInfoLite
  output?: OutputInfoLite
  options: Record<string, unknown> & { regions?: Region[] }
  result?: { saved_bytes: number; compression_ratio: number }
  error?: string
}

export interface Capabilities {
  /** Server ffmpeg + ffprobe run. When false, uploads are rejected. */
  ffmpeg_ok: boolean
  webp: boolean
  libx264: boolean
  libvpx: boolean
  libvpx_vp9: boolean
  libaom_av1: boolean
  mjpeg: boolean
  png: boolean
  gif: boolean
}

export type MediaType = 'image' | 'video'
