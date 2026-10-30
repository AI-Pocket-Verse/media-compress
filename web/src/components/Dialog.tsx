import { AlertCircle, AlertTriangle, CheckCircle, Copy, HelpCircle, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type DialogKind = 'info' | 'warning' | 'error' | 'success' | 'confirm'

interface DialogOptions {
  title?: string
  message: string
  kind?: DialogKind
  okText?: string
  cancelText?: string
}

interface DialogContextValue {
  alert: (opts: DialogOptions | string) => Promise<void>
  confirm: (opts: DialogOptions | string) => Promise<boolean>
}

const DialogContext = createContext<DialogContextValue | null>(null)

interface PendingState extends DialogOptions {
  withCancel: boolean
  resolve: (v: boolean) => void
}

const KIND_STYLES: Record<DialogKind, { Icon: typeof Info; iconClass: string; bgClass: string; okClass: string }> = {
  info: { Icon: Info, iconClass: 'text-indigo-500', bgClass: 'bg-indigo-50', okClass: 'bg-indigo-500 hover:bg-indigo-600' },
  warning: { Icon: AlertTriangle, iconClass: 'text-amber-500', bgClass: 'bg-amber-50', okClass: 'bg-amber-500 hover:bg-amber-600' },
  error: { Icon: AlertCircle, iconClass: 'text-red-500', bgClass: 'bg-red-50', okClass: 'bg-indigo-500 hover:bg-indigo-600' },
  success: { Icon: CheckCircle, iconClass: 'text-green-500', bgClass: 'bg-green-50', okClass: 'bg-indigo-500 hover:bg-indigo-600' },
  confirm: { Icon: HelpCircle, iconClass: 'text-amber-500', bgClass: 'bg-amber-50', okClass: 'bg-red-500 hover:bg-red-600' },
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch { /* fall through */ }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy') } finally { document.body.removeChild(ta) }
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null)
  const [copied, setCopied] = useState(false)

  const open = useCallback(
    (opts: DialogOptions | string, withCancel: boolean) =>
      new Promise<boolean>((resolve) => {
        const o = typeof opts === 'string' ? { message: opts } : opts
        setPending({ ...o, withCancel, resolve })
      }),
    [],
  )

  const value: DialogContextValue = {
    alert: async (opts) => { await open(opts, false) },
    confirm: (opts) => open(opts, true),
  }

  const close = (result: boolean) => {
    pending?.resolve(result)
    setPending(null)
    setCopied(false)
  }

  return (
    <DialogContext.Provider value={value}>
      {children}
      {pending && (() => {
        const kind = pending.kind ?? (pending.withCancel ? 'confirm' : 'info')
        const { Icon, iconClass, bgClass, okClass } = KIND_STYLES[kind]
        return (
          <div
            className="fixed inset-0 bg-black/60 z-[55] flex items-center justify-center p-6"
            onClick={(e) => { if (e.target === e.currentTarget) close(pending.withCancel ? false : true) }}
          >
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
              <div className="flex items-start gap-3 p-6 pb-4">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${bgClass}`}>
                  <Icon className={`w-5 h-5 ${iconClass}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-bold text-gray-800">
                      {pending.title ?? (pending.withCancel ? '请确认' : kind === 'error' ? '出错了' : '提示')}
                    </h2>
                    {kind === 'error' && (
                      <button
                        onClick={async () => {
                          await copyToClipboard(pending.message)
                          setCopied(true)
                          setTimeout(() => setCopied(false), 1500)
                        }}
                        className="text-indigo-500 hover:text-indigo-600 font-medium inline-flex items-center gap-1.5 text-xs flex-shrink-0"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copied ? '已复制' : '复制'}</span>
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1.5 whitespace-pre-wrap break-words select-all">{pending.message}</p>
                </div>
              </div>
              <div className="px-6 pb-6 flex justify-end gap-2">
                {pending.withCancel && (
                  <button onClick={() => close(false)} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors">
                    {pending.cancelText ?? '取消'}
                  </button>
                )}
                <button onClick={() => close(true)} className={`px-5 py-2 text-sm text-white rounded-xl font-medium transition-colors ${okClass}`}>
                  {pending.okText ?? (pending.withCancel ? '确定' : '好的')}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </DialogContext.Provider>
  )
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used within <DialogProvider>')
  return ctx
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-gray-300 hover:text-gray-700 text-xl px-2">
      <X className="w-5 h-5" />
    </button>
  )
}
