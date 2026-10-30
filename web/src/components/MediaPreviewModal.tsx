import { X } from 'lucide-react'
import { useEffect, useMemo } from 'react'

import { formatBytes } from '../lib/format'
import { isVideo } from '../lib/media'

interface Props {
  file: File
  onClose: () => void
}

export function MediaPreviewModal({ file, onClose }: Props) {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const isVid = isVideo(file.name) || (file.type || '').startsWith('video/')

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <button onClick={onClose} className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur">
        <X className="w-5 h-5" />
      </button>
      <div className="absolute top-5 left-5 text-white/80 text-sm">
        <p className="font-medium truncate max-w-[60vw]">{file.name}</p>
        <p className="text-xs text-white/50 mt-0.5">{formatBytes(file.size)}</p>
      </div>
      <div className="max-w-[95vw] max-h-[90vh]">
        {isVid ? (
          <video src={url} controls autoPlay muted playsInline className="max-w-full max-h-[85vh] rounded-xl shadow-2xl bg-black" />
        ) : (
          <img src={url} alt="preview" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl bg-black/30" />
        )}
      </div>
    </div>
  )
}
