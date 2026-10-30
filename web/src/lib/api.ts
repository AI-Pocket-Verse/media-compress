import { createHttpClient } from '@media-compress/http-client'

import type { Capabilities, Task } from './types'

// BASE_URL is set by vite (`base` in vite.config.ts; '/' unless served under a sub-path).
// We strip the trailing '/' so URLs like `${prefix}/api/tasks` work in both modes.
const prefix = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')

const http = createHttpClient({ baseUrl: window.location.origin })

const p = (path: string) => `${prefix}${path}`

export const api = {
  listTasks: () => http.get<Task[]>(p('/api/tasks')),
  getTask: (id: string) => http.get<Task>(p(`/api/tasks/${id}`)),
  listFiles: () => http.get<{ tasks: Task[]; total_bytes: number }>(p('/api/files')),
  deleteFile: (id: string) => http.delete<{ deleted: string }>(p(`/api/files/${id}`)),
  capabilities: () => http.get<Capabilities>(p('/api/capabilities')),
  uploadCompress: (file: File, options: Record<string, unknown>) => {
    const fd = new FormData()
    // Fields must be appended BEFORE the file: the API's multipart loop breaks
    // on the first file part (to keep its stream consumable), so anything after
    // the file is never read.
    fd.append('options', JSON.stringify(options))
    fd.append('file', file)
    return http.post<{ task_id: string; filename: string }>(p('/api/upload'), undefined, {
      body: fd,
      headers: {}, // let browser set multipart boundary
    })
  },
  submitWatermark: (file: File, regions: { x: number; y: number; w: number; h: number }[]) => {
    const fd = new FormData()
    fd.append('regions', JSON.stringify(regions))
    fd.append('file', file)
    return http.post<{ task_id: string; filename: string }>(p('/api/watermark'), undefined, {
      body: fd,
      headers: {},
    })
  },
  downloadUrl: (id: string) => p(`/api/download/${id}`),
  batchDownloadUrl: (ids: string[]) => p(`/api/download/batch?ids=${encodeURIComponent(ids.join(','))}`),
  inputUrl: (id: string) => p(`/api/input/${id}`),
  thumbnailUrl: (id: string) => p(`/api/thumbnail/${id}`),
}
