import { AlertCircle, Copy, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useI18n } from '../i18n'
import type { Task } from '../lib/types'

export function ErrorModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const { t } = useI18n()
  const title = task.type === 'watermark' ? t('errorModal.watermarkFailed') : t('errorModal.compressFailed')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = async () => {
    const text = (task.error || '').trim()
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between p-6 pb-3 border-b border-gray-100">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 bg-red-50 rounded-2xl flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-red-500" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-gray-800">{title}</h2>
              <p className="text-xs text-gray-400 mt-1 truncate">{task.input.filename}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-700 px-2"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 pt-4 overflow-auto flex-1">
          <p className="text-xs text-gray-500 mb-2 flex items-center justify-between">
            <span>{t('errorModal.output')}</span>
            <button onClick={copy} className="text-indigo-500 hover:text-indigo-600 font-medium inline-flex items-center gap-1.5 text-xs">
              <Copy className="w-3 h-3" />
              <span>{copied ? t('common.copied') : t('common.copy')}</span>
            </button>
          </p>
          <pre className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-700 whitespace-pre-wrap break-all font-mono leading-relaxed select-all" style={{ maxHeight: '45vh', overflow: 'auto' }}>
            {(task.error?.startsWith('internal_error') ? t('errorModal.internal') : task.error || t('errorModal.noDetail')).trim()}
          </pre>
        </div>
        <div className="p-6 pt-0 flex justify-end gap-2">
          <button onClick={onClose} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl transition-colors">
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
