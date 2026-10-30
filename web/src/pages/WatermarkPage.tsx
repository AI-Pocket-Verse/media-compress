import { ChevronRight, CloudUpload, Crosshair, Download, Lightbulb, LogIn, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { RequireLogin, useAuth } from '@media-compress/auth-client-web'

import { CompareModal } from '../components/CompareModal'
import { useDialog } from '../components/Dialog'
import { ErrorModal } from '../components/ErrorModal'
import { FfmpegBanner } from '../components/FfmpegBanner'
import { StatusPills, TaskRow } from '../components/TaskRow'
import { api } from '../lib/api'
import { formatBytes } from '../lib/format'
import type { Region, Task } from '../lib/types'
import { refreshTasks, useTasksPolling, useTasksStore } from '../stores/useTasks'

export function WatermarkPage() {
  useTasksPolling()
  const tasks = useTasksStore((s) => s.tasks.filter((t) => t.type === 'watermark'))
  const dialog = useDialog()
  const { user, loginDirect } = useAuth()

  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [isVid, setIsVid] = useState(false)
  const [natural, setNatural] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [regions, setRegions] = useState<Region[]>([])
  const [draft, setDraft] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [activeId, setActiveId] = useState<string | null>(null)
  const seen = useRef(new Set<string>())

  const wrapRef = useRef<HTMLDivElement>(null)
  const mediaRef = useRef<HTMLImageElement | HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [compareTask, setCompareTask] = useState<Task | null>(null)
  const [errorTask, setErrorTask] = useState<Task | null>(null)
  const [ffmpegOk, setFfmpegOk] = useState(true)

  useEffect(() => {
    api.capabilities().then((c) => setFfmpegOk(c.ffmpeg_ok)).catch(() => undefined)
  }, [])

  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  useEffect(() => {
    if (!activeId) return
    const t = tasks.find((x) => x.id === activeId)
    if (!t) return
    if (t.status === 'done' && !seen.current.has(t.id)) {
      seen.current.add(t.id)
      setCompareTask(t)
      setActiveId(null)
    } else if (t.status === 'failed') {
      setErrorTask(t)
      setActiveId(null)
    }
  }, [tasks, activeId])

  const loadFile = (f: File) => {
    if (url) URL.revokeObjectURL(url)
    const newUrl = URL.createObjectURL(f)
    const v = f.type.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|ts|3gp|ogv)$/i.test(f.name)
    setFile(f)
    setUrl(newUrl)
    setIsVid(v)
    setRegions([])
    setStep(2)
  }

  const reset = () => {
    if (url) URL.revokeObjectURL(url)
    setFile(null)
    setUrl(null)
    setRegions([])
    setNatural({ w: 0, h: 0 })
    setStep(1)
  }

  const onMediaReady = () => {
    if (!mediaRef.current) return
    if (isVid) {
      const v = mediaRef.current as HTMLVideoElement
      setNatural({ w: v.videoWidth, h: v.videoHeight })
    } else {
      const img = mediaRef.current as HTMLImageElement
      setNatural({ w: img.naturalWidth, h: img.naturalHeight })
    }
  }

  const getMediaRect = (): { left: number; top: number; width: number; height: number } | null => {
    if (!wrapRef.current || !mediaRef.current) return null
    const wr = wrapRef.current.getBoundingClientRect()
    const mr = mediaRef.current.getBoundingClientRect()
    return { left: mr.left - wr.left, top: mr.top - wr.top, width: mr.width, height: mr.height }
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.wm-box')) return
    const rect = wrapRef.current!.getBoundingClientRect()
    setDraft({ startX: e.clientX - rect.left, startY: e.clientY - rect.top, endX: e.clientX - rect.left, endY: e.clientY - rect.top })
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!draft) return
    const rect = wrapRef.current!.getBoundingClientRect()
    setDraft({ ...draft, endX: Math.max(0, Math.min(rect.width, e.clientX - rect.left)), endY: Math.max(0, Math.min(rect.height, e.clientY - rect.top)) })
  }
  const onMouseUp = () => {
    if (!draft) return
    const m = getMediaRect()
    if (m && natural.w) {
      const x0 = Math.min(draft.startX, draft.endX) - m.left
      const y0 = Math.min(draft.startY, draft.endY) - m.top
      const w = Math.abs(draft.endX - draft.startX)
      const h = Math.abs(draft.endY - draft.startY)
      if (!(x0 + w < 0 || y0 + h < 0 || x0 > m.width || y0 > m.height) && w >= 5 && h >= 5) {
        const sx = natural.w / m.width
        const sy = natural.h / m.height
        const x = Math.max(0, Math.round(x0 * sx))
        const y = Math.max(0, Math.round(y0 * sy))
        const r: Region = { x, y, w: Math.min(Math.round(w * sx), natural.w - x), h: Math.min(Math.round(h * sy), natural.h - y) }
        setRegions((cur) => [...cur, r])
      }
    }
    setDraft(null)
  }

  const submit = async () => {
    if (!file || !regions.length) return
    try {
      const res = await api.submitWatermark(file, regions)
      setActiveId(res.task_id)
      reset()
      refreshTasks()
    } catch (e) {
      await dialog.alert({ message: '提交失败：' + (e as Error).message, kind: 'error' })
    }
  }

  const m = getMediaRect()

  return (
    <>
      <FfmpegBanner ok={ffmpegOk} />
      <div className="flex items-center gap-3 mb-6">
        {([1, 2, 3] as const).map((n) => (
          <Fragment key={n}>
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold flex-shrink-0 ${
              n < step ? 'step-done' : n === step ? 'step-active' : 'step-todo'
            }`}>
              {n === 1 && <Upload className="w-4 h-4" />}
              {n === 2 && <Crosshair className="w-4 h-4" />}
              {n === 3 && <Download className="w-4 h-4" />}
              {n === 1 ? '1. 上传文件' : n === 2 ? '2. 框选水印' : '3. 下载结果'}
            </div>
            {n < 3 && <div className="h-px flex-1 bg-gray-200" />}
          </Fragment>
        ))}
      </div>

      <div className="flex gap-5 mb-5">
        <div className="card flex-1 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="font-bold text-gray-700">预览图</span>
              <span className="ml-2 text-xs text-gray-400">
                {file ? `${file.name} · ${natural.w}×${natural.h} · ${formatBytes(file.size)}` : '尚未选择文件'}
              </span>
            </div>
            <button onClick={reset} className="text-xs px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-400 hover:text-red-400 hover:border-red-200 rounded-lg transition-colors inline-flex items-center gap-1.5">
              <Trash2 className="w-3 h-3" /> 重置
            </button>
          </div>
          <div
            className="relative rounded-xl overflow-hidden h-[480px] bg-gradient-to-br from-indigo-50 to-violet-50 flex items-center justify-center cursor-pointer"
            onClick={() => {
              if (file) return
              if (!user) { loginDirect(); return }
              fileInputRef.current?.click()
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (!e.dataTransfer.files[0]) return
              if (!user) { loginDirect(); return }
              loadFile(e.dataTransfer.files[0])
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) loadFile(e.target.files[0]); e.target.value = '' }}
            />
            {!file ? (
              <div className="text-center">
                <div className="w-16 h-16 bg-white rounded-3xl shadow-sm border border-indigo-100 flex items-center justify-center mx-auto mb-4">
                  <CloudUpload className="w-7 h-7 text-indigo-400" />
                </div>
                <p className="text-gray-700 font-bold mb-1">点击或拖拽上传文件</p>
                <p className="text-gray-400 text-sm">图片或视频</p>
              </div>
            ) : (
              <div
                ref={wrapRef}
                style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none' }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={() => setDraft(null)}
              >
                {isVid ? (
                  <video ref={mediaRef as React.RefObject<HTMLVideoElement>} className="wm-media" style={{ maxWidth: '100%', maxHeight: 480, display: 'block' }} src={url ?? ''} muted playsInline onLoadedMetadata={onMediaReady} />
                ) : (
                  <img ref={mediaRef as React.RefObject<HTMLImageElement>} className="wm-media" style={{ maxWidth: '100%', maxHeight: 480, display: 'block' }} src={url ?? ''} alt="" onLoad={onMediaReady} draggable={false} />
                )}
                {regions.map((r, i) => {
                  if (!m || !natural.w) return null
                  const sx = m.width / natural.w
                  const sy = m.height / natural.h
                  return (
                    <div key={i} className="wm-box" style={{ left: m.left + r.x * sx, top: m.top + r.y * sy, width: r.w * sx, height: r.h * sy }}>
                      <span className="lbl">水印 {i + 1}</span>
                      <span className="del" onClick={(e) => { e.stopPropagation(); setRegions((cur) => cur.filter((_, j) => j !== i)) }}>
                        <X className="w-2.5 h-2.5" />
                      </span>
                    </div>
                  )
                })}
                {draft && (
                  <div className="wm-draft" style={{
                    left: Math.min(draft.startX, draft.endX),
                    top: Math.min(draft.startY, draft.endY),
                    width: Math.abs(draft.endX - draft.startX),
                    height: Math.abs(draft.endY - draft.startY),
                  }} />
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
            <Lightbulb className="w-3 h-3 text-indigo-300" /> 纯色/渐变背景效果最佳，复杂纹理可能留有痕迹
          </div>
        </div>

        <div className="w-60 flex flex-col gap-4 flex-shrink-0">
          <div className="card p-4 flex-1">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-gray-700">已标记区域</span>
              <span className="text-xs bg-amber-100 text-amber-600 font-bold px-2 py-0.5 rounded-full">{regions.length} 个</span>
            </div>
            <div className="space-y-2 mb-4">
              {regions.length === 0 ? (
                <p className="text-xs text-gray-300 text-center py-4">尚未标记任何区域</p>
              ) : (
                regions.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 bg-amber-50 rounded-xl border border-amber-100">
                    <div className="w-3 h-3 bg-amber-400 rounded-sm mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-600">水印 {i + 1}</p>
                      <p className="text-xs text-gray-400 mt-0.5">x:{r.x} y:{r.y} · {r.w}×{r.h}</p>
                    </div>
                    <button onClick={() => setRegions((cur) => cur.filter((_, j) => j !== i))} className="text-red-300 hover:text-red-500 flex-shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-100 text-xs text-amber-600 leading-relaxed">
              <Lightbulb className="w-3 h-3 inline mr-1.5" /> 用鼠标在预览图上拖拽即可标记
            </div>
          </div>

          <RequireLogin onAuthorized={submit}>
            <button disabled={!file || regions.length === 0} className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 disabled:cursor-not-allowed text-white text-sm font-bold rounded-2xl shadow-sm transition-colors inline-flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" /> 提交任务
            </button>
          </RequireLogin>
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-gray-800">任务队列</h2>
            <span className="text-xs text-gray-400">{tasks.length} 个文件</span>
          </div>
          <StatusPills tasks={tasks} />
        </div>
        <div className="grid grid-cols-12 text-xs text-gray-300 font-medium px-4 mb-2">
          <div className="col-span-5">文件名</div>
          <div className="col-span-3">进度</div>
          <div className="col-span-2 text-center">区域</div>
          <div className="col-span-2 text-right">操作</div>
        </div>
        <div className="space-y-1">
          {!user ? (
            <div className="text-center text-xs text-gray-300 py-12">
              <LogIn className="w-8 h-8 text-gray-200 mx-auto mb-3" />
              登录后查看您的任务
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-center text-xs text-gray-300 py-12">暂无任务，上传文件 + 框选水印开始处理</p>
          ) : (
            tasks.slice(0, 5).map((t) => <TaskRow key={t.id} task={t} onCompare={setCompareTask} onError={setErrorTask} />)
          )}
        </div>
        {tasks.length > 5 && (
          <Link
            to="/files"
            className="mt-3 flex items-center justify-center gap-1 text-xs text-indigo-500 hover:text-indigo-600 font-semibold py-2 rounded-xl hover:bg-indigo-50 transition-colors"
          >
            查看更多（还有 {tasks.length - 5} 个）
            <ChevronRight className="w-3 h-3" />
          </Link>
        )}
      </div>

      {compareTask && <CompareModal task={compareTask} onClose={() => setCompareTask(null)} />}
      {errorTask && <ErrorModal task={errorTask} onClose={() => setErrorTask(null)} />}
    </>
  )
}
