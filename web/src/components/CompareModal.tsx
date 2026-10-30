import { ArrowLeftRight, Download, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { api } from '../lib/api'
import { formatBytes, formatMediaInfo } from '../lib/format'
import { isVideo } from '../lib/media'
import type { Task } from '../lib/types'

export function CompareModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const video = (task.input.mime || '').startsWith('video') || isVideo(task.input.filename)
  const title = task.type === 'watermark' ? '去水印对比' : '压缩对比'

  let meta = ''
  if (task.type === 'compress' && task.result) {
    const ratio = Math.round((task.result.compression_ratio || 0) * 100)
    const label = ratio > 0 ? `-${ratio}%` : ratio < 0 ? `+${-ratio}%` : '≈ 无变化'
    meta = `${formatBytes(task.input.size)} → ${formatBytes(task.output?.size ?? 0)} · ${label}`
  } else if (task.type === 'watermark') {
    const n = task.options.regions?.length ?? 0
    meta = `去水印 · ${n} 个区域 · ${formatBytes(task.input.size)} → ${formatBytes(task.output?.size ?? 0)}`
  }
  // formatMediaInfo expects ProbeMeta but Task carries metadata as `unknown`
  // (preserves forward-compat with newer probe fields). Cast is fine.
  const probeInput = formatMediaInfo(task.input.metadata as Parameters<typeof formatMediaInfo>[0])
  const probeOutput = formatMediaInfo(task.output?.metadata as Parameters<typeof formatMediaInfo>[0])
  const inputSizeLabel = formatBytes(task.input.size)
  const outputSizeLabel = task.output ? formatBytes(task.output.size) : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Stable per task — without useMemo, every re-render (e.g. from the polling
  // store updating in the parent) would recompute Date.now(), which changes
  // the <video src=...> and forces a full reload → flicker / black loading.
  // task.updated_at is enough to bust the cache when the server actually
  // re-processes the file.
  const before = useMemo(() => `${api.inputUrl(task.id)}?v=${encodeURIComponent(task.updated_at)}`, [task.id, task.updated_at])
  const after = useMemo(() => `${api.downloadUrl(task.id)}?v=${encodeURIComponent(task.updated_at)}`, [task.id, task.updated_at])

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0">
            <h2 className="font-bold text-gray-800">{title}</h2>
            <p className="text-xs text-gray-400 mt-1 truncate">{task.input.filename}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 px-2"><X className="w-5 h-5" /></button>
        </div>
        {video ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-1.5 flex items-baseline justify-between gap-2">
                <span>原视频</span>
                <span className="text-[11px] text-gray-400 font-mono">{inputSizeLabel}</span>
              </p>
              <video src={before} controls className="w-full rounded-xl bg-black" style={{ maxHeight: '60vh' }} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1.5 flex items-baseline justify-between gap-2">
                <span>处理后</span>
                {outputSizeLabel && (
                  <span className="text-[11px] text-indigo-500 font-mono font-semibold">{outputSizeLabel}</span>
                )}
              </p>
              <video src={after} controls className="w-full rounded-xl bg-black" style={{ maxHeight: '60vh' }} />
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <p className="text-xs text-gray-500 flex items-baseline justify-between gap-2">
                <span>原图</span>
                <span className="text-[11px] text-gray-400 font-mono">{inputSizeLabel}</span>
              </p>
              <p className="text-xs text-gray-500 flex items-baseline justify-between gap-2">
                <span>处理后</span>
                {outputSizeLabel && (
                  <span className="text-[11px] text-indigo-500 font-mono font-semibold">{outputSizeLabel}</span>
                )}
              </p>
            </div>
            <ImageSlider before={before} after={after} />
          </>
        )}
        <p className="text-xs text-gray-500 mt-4 leading-relaxed">
          {meta}
          {probeInput && <><br /><span className="text-gray-400">原始文件 · {probeInput}</span></>}
          {probeOutput && <><br /><span className="text-gray-400">处理后 · {probeOutput}</span></>}
        </p>
        <div className="flex justify-end mt-4 gap-2">
          <a
            href={api.downloadUrl(task.id)}
            download={task.output?.filename}
            className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold rounded-xl inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> 下载结果
          </a>
        </div>
      </div>
    </div>
  )
}

function ImageSlider({ before, after }: { before: string; after: string }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [pct, setPct] = useState(50)
  const dragging = useRef(false)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !rootRef.current) return
      const rect = rootRef.current.getBoundingClientRect()
      const p = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
      setPct(p)
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <div ref={rootRef} className="relative rounded-xl overflow-hidden select-none bg-gray-100" style={{ minHeight: 300, maxHeight: '60vh' }}>
      <img src={before} className="block w-full h-auto" style={{ maxHeight: '60vh', objectFit: 'contain' }} alt="before" />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${pct}%)` }}>
        <img src={after} className="block w-full h-auto" style={{ maxHeight: '60vh', objectFit: 'contain' }} alt="after" />
      </div>
      <div
        className="absolute inset-y-0 z-10 cursor-ew-resize"
        style={{ left: `${pct}%`, width: 2, background: 'white', boxShadow: '0 0 8px rgba(0,0,0,0.3)' }}
        onMouseDown={(e) => { e.preventDefault(); dragging.current = true }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center z-20">
          <ArrowLeftRight className="w-3 h-3 text-gray-400" />
        </div>
      </div>
      <div className="absolute bottom-3 left-3 z-10 bg-black/50 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-lg">原图</div>
      <div className="absolute bottom-3 right-3 z-10 bg-black/50 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-lg">处理后</div>
    </div>
  )
}
