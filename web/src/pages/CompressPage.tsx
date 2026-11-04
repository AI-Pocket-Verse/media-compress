import { ChevronLeft, ChevronRight, CloudUpload, Download, Inbox, LogIn, Trash2, X, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { RequireLogin, useAuth } from '@media-compress/auth-client-web'

import { CompareModal } from '../components/CompareModal'
import { useDialog } from '../components/Dialog'
import { ErrorModal } from '../components/ErrorModal'
import { FfmpegBanner } from '../components/FfmpegBanner'
import { LoadingOverlay } from '../components/LoadingOverlay'
import { MediaPreviewModal } from '../components/MediaPreviewModal'
import { StatusPills, TaskRow } from '../components/TaskRow'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { formatBytes, formatDuration } from '../lib/format'
import { detectMediaType, IMG_EXT, VID_EXT } from '../lib/media'
import { LANDSCAPE, MANUAL, PORTRAIT, RES_RE } from '../lib/resolutions'
import type { Capabilities, MediaType, Task } from '../lib/types'
import { refreshTasks, useTasksPolling, useTasksStore } from '../stores/useTasks'

interface PendingItem {
  file: File
  thumb?: string
  meta?: { width?: number; height?: number; duration?: number } | null
}

// Per-batch upload cap. Images can come in bulk (e.g. a folder of photos);
// videos are large and uploaded sequentially, so they keep a small cap.
const MAX_PENDING_IMAGE = 200
const MAX_PENDING_VIDEO = 20
const maxPendingFor = (t: MediaType | null) => (t === 'video' ? MAX_PENDING_VIDEO : MAX_PENDING_IMAGE)
const PAGE_SIZE = 20

export function CompressPage() {
  useTasksPolling()
  const allTasks = useTasksStore((s) => s.tasks)
  const dialog = useDialog()
  const { t, errorText } = useI18n()
  const { user, loginDirect } = useAuth()

  const tasks = useMemo(() => allTasks.filter((t) => t.type === 'compress'), [allTasks])

  // Task-queue pagination — 20 tasks per page.
  const [page, setPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE))
  useEffect(() => { if (page > totalPages - 1) setPage(totalPages - 1) }, [page, totalPages])
  const pageTasks = useMemo(() => tasks.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [tasks, page])

  // The most recent upload batch, for the one-click "download this batch as a
  // zip" action. In-memory only (a convenience for the moment right after
  // compressing) — a page reload clears it.
  const [batchIds, setBatchIds] = useState<string[]>([])
  const batchTasks = useMemo(
    () => batchIds.map((id) => tasks.find((t) => t.id === id)).filter(Boolean) as Task[],
    [batchIds, tasks],
  )
  const batchDone = useMemo(() => batchTasks.filter((t) => t.status === 'done' && t.output), [batchTasks])
  const batchSettled =
    batchIds.length > 0 &&
    batchTasks.length === batchIds.length &&
    batchTasks.every((t) => t.status === 'done' || t.status === 'failed')

  const [mode, setMode] = useState<'simple' | 'advanced'>('simple')
  const [preset, setPreset] = useState<'mobile' | 'balanced' | 'smallest' | 'highest'>('mobile')
  const [outputFormat, setOutputFormat] = useState('')
  const [audio, setAudio] = useState('')
  const [advQuality, setAdvQuality] = useState('75')
  const [advCrf, setAdvCrf] = useState('23')
  const [advBitrate, setAdvBitrate] = useState('')
  const [advFps, setAdvFps] = useState('')
  const [resolution, setResolution] = useState('')
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')
  const [submitInfo, setSubmitInfo] = useState<{ done: number; total: number } | null>(null)

  const [pending, setPending] = useState<PendingItem[]>([])
  const [mediaType, setMediaType] = useState<MediaType | null>(null)
  const [caps, setCaps] = useState<Capabilities>({
    ffmpeg_ok: true, webp: true, libx264: true, libvpx: true, libvpx_vp9: true,
    libaom_av1: false, mjpeg: true, png: true, gif: true,
  })
  // APP 预设的输出格式：图片优先 webp、视频 mp4；服务器 FFmpeg 缺对应编码器时退回 jpg / 原格式，
  // 否则默认设置下上传就会被拒（如 macOS Homebrew 的 ffmpeg 不带 libwebp）。
  const appFormat = (t: MediaType | null) =>
    t === 'image' ? (caps.webp ? 'webp' : 'jpg') : caps.libx264 ? 'mp4' : ''

  const [previewFile, setPreviewFile] = useState<File | null>(null)
  const [compareTask, setCompareTask] = useState<Task | null>(null)
  const [errorTask, setErrorTask] = useState<Task | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef(0)

  useEffect(() => {
    api.capabilities().then(setCaps).catch(() => undefined)
  }, [])

  // Unmount-only cleanup of thumb URLs (per-item revoke is handled inline on
  // remove/clear/submit). Keyed on [] with a ref so it doesn't revoke URLs that
  // are still being displayed when pending updates (e.g. probe() backfill).
  const pendingRef = useRef<PendingItem[]>([])
  useEffect(() => { pendingRef.current = pending }, [pending])
  useEffect(() => () => { pendingRef.current.forEach((p) => p.thumb && URL.revokeObjectURL(p.thumb)) }, [])

  const addFiles = async (files: File[]) => {
    const accepted: PendingItem[] = []
    const rejected: string[] = []
    let lock: MediaType | null = pending.length > 0 ? detectMediaType(pending[0]!.file) : null
    const label = (mt: MediaType) => (mt === 'image' ? t('compress.typeImage') : t('compress.typeVideo'))

    for (const f of files) {
      const mt = detectMediaType(f)
      if (!mt) { rejected.push(t('compress.rejectUnsupported', { name: f.name })); continue }
      if (!lock) lock = mt
      if (mt !== lock) { rejected.push(t('compress.rejectMixed', { name: f.name, type: label(lock) })); continue }
      const cap = maxPendingFor(lock)
      if (pending.length + accepted.length >= cap) { rejected.push(t('compress.rejectOverLimit', { name: f.name, cap })); continue }
      accepted.push({ file: f })
    }
    if (rejected.length) {
      // A dropped folder can reject many files (over-limit / wrong type) — keep
      // the dialog readable instead of listing hundreds of lines.
      const shown = rejected.slice(0, 8)
      const message = shown.join('\n') + (rejected.length > shown.length ? `\n${t('compress.skippedMore', { n: rejected.length })}` : '')
      await dialog.alert({ title: t('compress.skippedTitle'), message, kind: 'warning' })
    }

    const next = [...pending, ...accepted]
    setPending(next)
    if (next.length) setMediaType(detectMediaType(next[next.length - 1]!.file))

    // backfill thumbs + meta
    for (const item of accepted) {
      genThumb(item.file).then((thumb) => {
        setPending((cur) => cur.map((p) => (p.file === item.file ? { ...p, thumb: thumb ?? undefined } : p)))
      })
      probe(item.file).then((meta) => {
        setPending((cur) => cur.map((p) => (p.file === item.file ? { ...p, meta } : p)))
      })
    }

    if (preset === 'mobile' && next.length) {
      setOutputFormat(appFormat(detectMediaType(next[next.length - 1]!.file)))
    }
  }

  const getOptions = (): Record<string, unknown> => {
    const effRes = resolution === MANUAL ? `${customW}x${customH}` : resolution
    if (mode === 'advanced') {
      const opts: Record<string, unknown> = { mode: 'advanced' }
      if (mediaType !== 'video' && advQuality) opts.quality = parseInt(advQuality, 10)
      if (mediaType !== 'image') {
        if (advCrf) opts.crf = parseInt(advCrf, 10)
        if (advBitrate) opts.bitrate = advBitrate
        if (advFps) opts.fps = parseInt(advFps, 10)
      }
      if (effRes) opts.resolution = effRes
      if (outputFormat) opts.output_format = outputFormat
      if (mediaType === 'video' && audio) opts.audio = audio
      return opts
    }
    const opts: Record<string, unknown> = { mode: 'simple', quality_preset: preset, output_format: outputFormat || null }
    if (effRes) opts.resolution = effRes
    if (mediaType === 'video' && audio) opts.audio = audio
    return opts
  }

  const submit = async () => {
    if (!pending.length) return
    if (resolution === MANUAL && !RES_RE.test(`${customW}x${customH}`)) {
      await dialog.alert({ message: t('compress.manualResInvalid'), kind: 'error' })
      return
    }
    const opts = getOptions()
    const batch = [...pending]
    setPending([])
    setSubmitInfo({ done: 0, total: batch.length })
    const ids: string[] = []
    try {
      for (const item of batch) {
        try {
          const res = await api.uploadCompress(item.file, opts)
          ids.push(res.task_id)
          if (item.thumb) URL.revokeObjectURL(item.thumb)
        } catch (e) {
          setPending((cur) => [...cur, item])
          await dialog.alert({ message: t('compress.uploadFailed', { name: item.file.name, error: errorText(e) }), kind: 'error' })
        } finally {
          setSubmitInfo((cur) => (cur ? { ...cur, done: cur.done + 1 } : cur))
        }
      }
    } finally {
      setSubmitInfo(null)
    }
    // Remember this upload as the current batch and jump to the first page so
    // the freshly-created tasks (sorted newest-first) are visible.
    if (ids.length) { setBatchIds(ids); setPage(0) }
    refreshTasks()
  }

  return (
    <>
      <FfmpegBanner ok={caps.ffmpeg_ok} />
      <div className="card p-8 mb-5">
        <div
          className="drop-zone rounded-2xl py-14 text-center cursor-pointer mb-6"
          onClick={() => { if (!user) { loginDirect(); return } fileInputRef.current?.click() }}
          onDragOver={(e) => { e.preventDefault(); dragRef.current++ }}
          onDragLeave={() => { dragRef.current-- }}
          onDrop={(e) => {
            e.preventDefault()
            dragRef.current = 0
            if (!user) { loginDirect(); return }
            // Snapshot entries synchronously (webkitGetAsEntry is invalid once
            // the drop event returns), then resolve folders → their images.
            extractDroppedFiles(e.dataTransfer).then((files) => { if (files.length) addFiles(files) })
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { addFiles([...(e.target.files || [])]); e.target.value = '' }}
          />
          <div className="w-16 h-16 bg-white rounded-3xl shadow-sm border border-indigo-100 flex items-center justify-center mx-auto mb-4">
            <CloudUpload className="w-7 h-7 text-indigo-400" />
          </div>
          <p className="text-gray-700 font-bold mb-1">{t('compress.dropTitle')}</p>
          <p className="text-gray-400 text-sm">{t('compress.dropHint', { img: MAX_PENDING_IMAGE, vid: MAX_PENDING_VIDEO })}</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex bg-indigo-50 rounded-xl p-1 gap-0.5 text-xs">
            {(['simple', 'advanced'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-1.5 rounded-lg font-semibold ${mode === m ? 'bg-indigo-500 text-white' : 'text-indigo-400 hover:text-indigo-500'}`}
              >
                {m === 'simple' ? t('compress.modeSimple') : t('compress.modeAdvanced')}
              </button>
            ))}
          </div>
          <div className="h-5 w-px bg-gray-200" />
          <span className="text-xs text-gray-400">{t('compress.outputFormat')}</span>
          <select
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value)}
            className="border border-gray-200 text-gray-500 text-xs rounded-xl px-3 py-1.5 bg-gray-50"
          >
            <option value="">{t('compress.keepFormat')}</option>
            <option value="webp" disabled={!caps.webp || (mediaType ?? 'image') !== 'image'}>{t('compress.webpOption')}{!caps.webp && t('compress.needLibwebp')}</option>
            <option value="png" disabled={(mediaType ?? 'image') !== 'image'}>PNG</option>
            <option value="jpg" disabled={(mediaType ?? 'image') !== 'image'}>JPG</option>
            <option value="mp4" disabled={!caps.libx264 || (mediaType ?? 'video') !== 'video'}>{t('compress.mp4Option')}{!caps.libx264 && t('compress.needLibx264')}</option>
          </select>
          <span className="text-xs text-gray-400">{t('compress.resolution')}</span>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            className="border border-gray-200 text-gray-500 text-xs rounded-xl px-3 py-1.5 bg-gray-50"
          >
            <option value="">{t('compress.keepResolution')}</option>
            <optgroup label={t('compress.landscape')}>
              {LANDSCAPE.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </optgroup>
            <optgroup label={t('compress.portrait')}>
              {PORTRAIT.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </optgroup>
            <option value={MANUAL}>{t('compress.manualInput')}</option>
          </select>
          {resolution === MANUAL && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
              <input
                type="text"
                inputMode="numeric"
                placeholder={t('compress.width')}
                value={customW}
                onChange={(e) => setCustomW(e.target.value.replace(/\D/g, '').slice(0, 5))}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-16 text-center"
              />
              <span>×</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder={t('compress.height')}
                value={customH}
                onChange={(e) => setCustomH(e.target.value.replace(/\D/g, '').slice(0, 5))}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-16 text-center"
              />
            </span>
          )}
          {mediaType === 'video' && (
            <>
              <span className="text-xs text-gray-400">{t('compress.audio')}</span>
              <select
                value={audio}
                onChange={(e) => setAudio(e.target.value)}
                className="border border-gray-200 text-gray-500 text-xs rounded-xl px-3 py-1.5 bg-gray-50"
              >
                <option value="">{t('compress.audioDefault')}</option>
                <option value="reencode">{t('compress.audioReencode')}</option>
                <option value="copy">{t('compress.audioCopy')}</option>
                <option value="none">{t('compress.audioNone')}</option>
              </select>
            </>
          )}
        </div>

        {mode === 'simple' ? (
          <div className="flex items-center gap-3 flex-wrap mt-3 pt-3 border-t border-gray-100 min-h-[60px]">
            <span className="text-xs text-gray-400">{t('compress.quality')}</span>
            <div className="flex gap-1.5">
              {(['mobile', 'balanced', 'smallest', 'highest'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    setPreset(k)
                    if (k === 'mobile' && mediaType) setOutputFormat(appFormat(mediaType))
                  }}
                  className={`px-3 py-1.5 text-xs rounded-xl font-semibold ${preset === k ? 'bg-indigo-500 text-white' : 'bg-white border border-gray-200 text-gray-400'}`}
                >
                  {t(`preset.${k}`)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-wrap mt-3 pt-3 border-t border-gray-100 min-h-[60px]">
            {mediaType !== 'video' && (
              <label className="flex items-center gap-1.5 text-xs text-gray-400">{t('compress.imageQuality')}
                <input type="number" min={0} max={100} value={advQuality} onChange={(e) => setAdvQuality(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-16" />
              </label>
            )}
            {mediaType !== 'image' && (
              <>
                <label className="flex items-center gap-1.5 text-xs text-gray-400">{t('compress.videoCrf')}
                  <input type="number" min={0} max={51} value={advCrf} onChange={(e) => setAdvCrf(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-16" />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-gray-400">{t('compress.bitrate')}
                  <input type="text" placeholder="1500k" value={advBitrate} onChange={(e) => setAdvBitrate(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-20" />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-gray-400">FPS
                  <select value={advFps} onChange={(e) => setAdvFps(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white">
                    <option value="">{t('compress.fpsOriginal')}</option>
                    <option value="24">24</option>
                    <option value="30">30</option>
                    <option value="60">60</option>
                  </select>
                </label>
              </>
            )}
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <div className="card p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-gray-800">{t('compress.pendingTitle')}</h2>
              <span className="text-xs text-gray-400">{t('queue.fileCount', { n: pending.length })}</span>
              <span className="text-xs text-gray-300">·</span>
              <span className="text-xs text-gray-400">{t('compress.pendingMax', { n: maxPendingFor(mediaType) })}</span>
            </div>
            <button
              onClick={() => { pending.forEach((p) => p.thumb && URL.revokeObjectURL(p.thumb)); setPending([]) }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors inline-flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> {t('compress.clear')}
            </button>
          </div>
          <div className="space-y-2 mb-4">
            {pending.map((item, i) => {
              const v = VID_EXT.test(item.file.name)
              const dims = item.meta?.width ? ` · ${item.meta.width}×${item.meta.height}` : ''
              const dur = item.meta?.duration ? ` · ${formatDuration(item.meta.duration)}` : ''
              return (
                <div
                  key={i}
                  onClick={() => setPreviewFile(item.file)}
                  className="flex items-center gap-3 p-3 bg-indigo-50/40 rounded-xl border border-indigo-100 cursor-pointer hover:bg-indigo-50/70 transition-colors"
                >
                  <div className="relative w-9 h-9 bg-white rounded-xl border border-indigo-100 overflow-hidden flex-shrink-0">
                    {item.thumb && <img src={item.thumb} className="absolute inset-0 w-full h-full object-cover" alt="" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{item.file.name}</p>
                    <p className="text-xs text-gray-400">{formatBytes(item.file.size)}{dims}{dur}{v ? t('compress.videoTag') : ''}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setPending((cur) => cur.filter((_, j) => j !== i)); if (item.thumb) URL.revokeObjectURL(item.thumb) }}
                    className="w-7 h-7 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                  >
                    <X className="w-4 h-4 mx-auto" />
                  </button>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gray-400 mb-3">
            {t('compress.hintBefore')}<strong className="text-indigo-500 font-semibold">{t('compress.hintStrong')}</strong>{t('compress.hintAfter')}
          </p>
          <RequireLogin onAuthorized={submit}>
            <button className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 text-white text-sm font-bold rounded-2xl shadow-sm transition-colors inline-flex items-center justify-center gap-2">
              <Zap className="w-4 h-4" /> {t('compress.start', { n: pending.length })}
            </button>
          </RequireLogin>
        </div>
      )}

      <div className="card p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-gray-800">{t('queue.title')}</h2>
            <span className="text-xs text-gray-400">{t('queue.fileCount', { n: tasks.length })}</span>
          </div>
          <StatusPills tasks={tasks} />
        </div>

        {batchIds.length >= 2 && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl">
            <div className="flex-1 min-w-0 text-xs text-indigo-500">
              {!batchSettled ? (
                <>{t('compress.batchProgress', { done: batchDone.length, total: batchIds.length })}</>
              ) : batchDone.length > 0 ? (
                <>{t('compress.batchDone')}{batchDone.length < batchIds.length ? t('compress.batchPartial', { done: batchDone.length, total: batchIds.length }) : ''}</>
              ) : (
                <>{t('compress.batchAllFailed')}</>
              )}
            </div>
            {batchSettled && batchDone.length > 0 && (
              <a
                href={api.batchDownloadUrl(batchDone.map((t) => t.id))}
                className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors flex-shrink-0"
              >
                <Download className="w-3.5 h-3.5" /> {t('compress.batchZip', { n: batchDone.length })}
              </a>
            )}
            <button
              onClick={() => setBatchIds([])}
              className="w-6 h-6 rounded-lg text-indigo-300 hover:text-indigo-500 hover:bg-indigo-100 transition-colors flex-shrink-0"
              title={t('compress.collapse')}
            >
              <X className="w-4 h-4 mx-auto" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-12 text-xs text-gray-300 font-medium px-4 mb-2">
          <div className="col-span-5">{t('queue.colName')}</div>
          <div className="col-span-3">{t('queue.colProgress')}</div>
          <div className="col-span-2 text-center">{t('queue.colEffect')}</div>
          <div className="col-span-2 text-right">{t('queue.colActions')}</div>
        </div>
        <div className="space-y-1">
          {!user ? (
            <div className="text-center text-xs text-gray-300 py-12">
              <LogIn className="w-8 h-8 text-gray-200 mx-auto mb-3" />
              {t('queue.loginToView')}
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center text-xs text-gray-300 py-12">
              <Inbox className="w-8 h-8 text-gray-200 mx-auto mb-3" />
              {t('queue.emptyCompress')}
            </div>
          ) : (
            pageTasks.map((t) => <TaskRow key={t.id} task={t} onCompare={setCompareTask} onError={setErrorTask} />)
          )}
        </div>
        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-center gap-2 text-xs">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page <= 0}
              className="px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400 transition-colors inline-flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> {t('queue.prev')}
            </button>
            <span className="text-gray-400 font-medium tabular-nums px-1">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400 transition-colors inline-flex items-center gap-1"
            >
              {t('queue.next')} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {submitInfo && <LoadingOverlay message={t('compress.submitting', { done: submitInfo.done, total: submitInfo.total })} />}
      {previewFile && <MediaPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
      {compareTask && <CompareModal task={compareTask} onClose={() => setCompareTask(null)} />}
      {errorTask && <ErrorModal task={errorTask} onClose={() => setErrorTask(null)} />}
    </>
  )
}

function genThumb(file: File): Promise<string | null> {
  const v = VID_EXT.test(file.name) || (file.type || '').startsWith('video/')
  if (!v) return Promise.resolve(URL.createObjectURL(file))
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    video.src = url
    const fail = () => { URL.revokeObjectURL(url); resolve(null) }
    video.onerror = fail
    video.onloadeddata = () => {
      try {
        const c = document.createElement('canvas')
        c.width = video.videoWidth || 240
        c.height = video.videoHeight || 180
        c.getContext('2d')!.drawImage(video, 0, 0)
        URL.revokeObjectURL(url)
        c.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/jpeg', 0.7)
      } catch { fail() }
    }
  })
}

function probe(file: File): Promise<{ width?: number; height?: number; duration?: number } | null> {
  return new Promise((resolve) => {
    const isVid = VID_EXT.test(file.name) || (file.type || '').startsWith('video/')
    const url = URL.createObjectURL(file)
    const done = (m: { width?: number; height?: number; duration?: number } | null) => { URL.revokeObjectURL(url); resolve(m) }
    if (isVid) {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.muted = true
      v.onloadedmetadata = () => done({ width: v.videoWidth, height: v.videoHeight, duration: v.duration })
      v.onerror = () => done(null)
      v.src = url
    } else if (IMG_EXT.test(file.name) || (file.type || '').startsWith('image/')) {
      const img = new Image()
      img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => done(null)
      img.src = url
    } else {
      done(null)
    }
  })
}

// Resolve a drop into a flat File[]. Loose files keep their original behavior
// (image or video); a dropped folder contributes only the images directly
// inside it — nested folders (and their contents) are ignored.
async function extractDroppedFiles(dt: DataTransfer): Promise<File[]> {
  const items = dt.items
  if (!items || items.length === 0 || typeof items[0]?.webkitGetAsEntry !== 'function') {
    return [...dt.files]
  }
  // webkitGetAsEntry() is only valid synchronously during the drop event, so
  // snapshot every entry before the first await below.
  const entries: FileSystemEntry[] = []
  for (let i = 0; i < items.length; i++) {
    const entry = items[i]?.webkitGetAsEntry()
    if (entry) entries.push(entry)
  }
  const out: File[] = []
  for (const entry of entries) {
    if (entry.isFile) {
      const f = await entryToFile(entry as FileSystemFileEntry).catch(() => null)
      if (f) out.push(f)
    } else if (entry.isDirectory) {
      out.push(...(await readFolderImages(entry as FileSystemDirectoryEntry)))
    }
  }
  return out
}

function entryToFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

async function readFolderImages(dir: FileSystemDirectoryEntry): Promise<File[]> {
  const reader = dir.createReader()
  const children: FileSystemEntry[] = []
  // readEntries() returns at most ~100 entries per call — loop until it's empty.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    )
    if (batch.length === 0) break
    children.push(...batch)
  }
  const files: File[] = []
  for (const child of children) {
    if (child.isFile && IMG_EXT.test(child.name)) {
      const f = await entryToFile(child as FileSystemFileEntry).catch(() => null)
      if (f) files.push(f)
    }
  }
  return files
}
