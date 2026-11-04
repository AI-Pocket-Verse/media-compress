import { AlertCircle, ArrowLeftRight, Download, FileVideo, Image as ImageIcon, Loader2 } from 'lucide-react'

import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { formatBytes } from '../lib/format'
import { isVideo } from '../lib/media'
import type { Task } from '../lib/types'

interface Props {
  task: Task
  onCompare: (t: Task) => void
  onError: (t: Task) => void
}

export function TaskRow({ task, onCompare, onError }: Props) {
  const { t } = useI18n()
  const video = (task.input.mime || '').startsWith('video') || isVideo(task.input.filename)
  const Icon = video ? FileVideo : ImageIcon
  const iconColor = video ? 'text-blue-400' : 'text-green-400'

  let bg = ''
  let pct = 0
  let pctLabel: string | null = null
  let barColor = 'bg-gray-200'
  let effect: React.ReactNode = <span className="text-gray-300 text-sm">—</span>
  let action: React.ReactNode = null
  let rowClick: (() => void) | undefined

  if (task.status === 'done') {
    pct = 100
    barColor = 'bg-green-400'
    effect = effectCell(task, t)
    rowClick = () => onCompare(task)
    action = (
      <div className="flex items-center justify-end gap-1.5">
        <button onClick={(e) => { e.stopPropagation(); onCompare(task) }} className="px-2.5 py-1.5 bg-white border border-indigo-200 text-indigo-500 hover:bg-indigo-50 text-xs rounded-lg inline-flex items-center gap-1 transition-colors">
          <ArrowLeftRight className="w-3 h-3" /> {t('common.compare')}
        </button>
        <a href={api.downloadUrl(task.id)} onClick={(e) => e.stopPropagation()} className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs rounded-lg inline-flex items-center gap-1.5 transition-colors">
          <Download className="w-3 h-3" /> {t('common.download')}
        </a>
      </div>
    )
  } else if (task.status === 'processing') {
    bg = 'bg-blue-50/50'
    pct = 100
    pctLabel = t('task.processing')
    barColor = 'bg-blue-400 wm-stripe-animate'
    action = <Loader2 className="w-4 h-4 text-blue-300 animate-spin" />
  } else if (task.status === 'pending') {
    bg = 'opacity-50'
    pctLabel = t('status.pending')
  } else if (task.status === 'failed') {
    bg = 'bg-red-50'
    pct = 100
    pctLabel = t('status.failed')
    barColor = 'bg-red-300'
    rowClick = () => onError(task)
    effect = (
      <>
        <span className="text-sm font-bold text-red-500">{t('status.failed')}</span>
        <p className="text-xs text-gray-400">{t('task.clickToView')}</p>
      </>
    )
    action = (
      <button onClick={(e) => { e.stopPropagation(); onError(task) }} className="px-2.5 py-1.5 bg-white border border-red-200 text-red-500 hover:bg-red-50 text-xs rounded-lg inline-flex items-center gap-1.5 transition-colors">
        <AlertCircle className="w-3 h-3" /> {t('common.details')}
      </button>
    )
  }

  return (
    <div
      className={`file-row grid grid-cols-12 items-center p-4 rounded-xl transition-colors ${bg} ${rowClick ? 'cursor-pointer hover:bg-indigo-50/40' : ''}`}
      onClick={rowClick}
    >
      <div className="col-span-5 flex items-center gap-3 min-w-0">
        <div className="relative w-9 h-9 bg-gray-50 rounded-xl border border-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          <img src={api.thumbnailUrl(task.id)} loading="lazy" alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-700 truncate">{task.input.filename}</p>
          <p className="text-xs text-gray-400">{formatBytes(task.input.size)}</p>
        </div>
      </div>
      <div className="col-span-3 pr-4">
        <div className="progress-track h-2 rounded-full overflow-hidden">
          <div className={`h-2 ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
        {pctLabel && <p className="text-xs text-gray-400 mt-1">{pctLabel}</p>}
      </div>
      <div className="col-span-2 text-center">{effect}</div>
      <div className="col-span-2 flex justify-end">{action}</div>
    </div>
  )
}

function effectCell(task: Task, t: ReturnType<typeof useI18n>['t']): React.ReactNode {
  if (task.type === 'watermark') {
    const n = task.options.regions?.length ?? 0
    return (
      <>
        <span className="text-sm font-bold text-green-500">{t('task.regions', { n })}</span>
        <p className="text-xs text-gray-400">{formatBytes(task.output?.size ?? 0)}</p>
      </>
    )
  }
  if (!task.result || !task.output) return <span className="text-gray-300 text-sm">—</span>
  const pct = Math.round((task.result.compression_ratio || 0) * 100)
  if (pct > 0) {
    return (
      <>
        <span className="text-sm font-bold text-green-500">-{pct}%</span>
        <p className="text-xs text-gray-400">{formatBytes(task.output.size)}</p>
      </>
    )
  }
  if (pct < 0) {
    return (
      <>
        <span className="text-sm font-bold text-amber-500" title={t('task.largerTitle')}>+{-pct}%</span>
        <p className="text-xs text-gray-400">{t('task.larger')}</p>
      </>
    )
  }
  return (
    <>
      <span className="text-sm font-bold text-gray-500">{t('task.noChange')}</span>
      <p className="text-xs text-gray-400">{formatBytes(task.output.size)}</p>
    </>
  )
}

export function StatusPills({ tasks }: { tasks: Task[] }) {
  const { t } = useI18n()
  const counts: { done: number; processing: number; pending: number; failed: number } = {
    done: 0, processing: 0, pending: 0, failed: 0,
  }
  for (const t of tasks) counts[t.status] += 1
  return (
    <div className="flex gap-1.5">
      {counts.done > 0 && <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-500 font-semibold border border-green-100">{t('pill.done', { n: counts.done })}</span>}
      {counts.processing > 0 && <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-500 font-semibold border border-blue-100 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />{t('pill.processing', { n: counts.processing })}</span>}
      {counts.pending > 0 && <span className="text-xs px-2.5 py-1 rounded-full bg-gray-50 text-gray-400 font-semibold border border-gray-100">{t('pill.pending', { n: counts.pending })}</span>}
      {counts.failed > 0 && <span className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-500 font-semibold border border-red-100">{t('pill.failed', { n: counts.failed })}</span>}
    </div>
  )
}
