import { AlertCircle, ArrowLeftRight, Download, Eraser, Image as ImageIcon, LogIn, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '@media-compress/auth-client-web'

import { CompareModal } from '../components/CompareModal'
import { useDialog } from '../components/Dialog'
import { ErrorModal } from '../components/ErrorModal'
import { api } from '../lib/api'
import { formatBytes, formatDate } from '../lib/format'
import type { Task } from '../lib/types'

export function FilesPage() {
  const dialog = useDialog()
  const { user, loading: authLoading } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [totalBytes, setTotalBytes] = useState(0)
  const [search, setSearch] = useState('')
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const [compareTask, setCompareTask] = useState<Task | null>(null)
  const [errorTask, setErrorTask] = useState<Task | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const load = async () => {
    setSelected(new Set())
    try {
      const body = await api.listFiles()
      setTasks(body.tasks)
      setTotalBytes(body.total_bytes)
      setLoadErr(null)
    } catch (e) {
      setLoadErr((e as Error).message)
    }
  }

  useEffect(() => {
    if (!authLoading && user) load()
    if (!user) { setTasks([]); setTotalBytes(0); setLoadErr(null) }
  }, [user, authLoading])

  const filtered = useMemo(() => {
    const f = search.toLowerCase()
    return tasks.filter((t) => !f || t.input.filename.toLowerCase().includes(f))
  }, [tasks, search])

  const downloadable = (t: Task) => t.status === 'done' && !!t.output
  const filteredDownloadable = useMemo(() => filtered.filter(downloadable), [filtered])
  const allSelected = filteredDownloadable.length > 0 && filteredDownloadable.every((t) => selected.has(t.id))

  const toggle = (id: string) =>
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s)
      if (allSelected) filteredDownloadable.forEach((t) => n.delete(t.id))
      else filteredDownloadable.forEach((t) => n.add(t.id))
      return n
    })

  const downloadSelected = () => {
    const ids = [...selected]
    if (ids.length === 0) return
    if (ids.length > 200) { void dialog.alert({ message: '一次最多下载 200 个，请减少选择', kind: 'warning' }); return }
    const url = ids.length === 1 ? api.downloadUrl(ids[0]!) : api.batchDownloadUrl(ids)
    const a = document.createElement('a')
    a.href = url
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // Drop selected ids that are no longer downloadable (deleted elsewhere or
  // reverted from done) so "已选 N" and the payload never carry stale ids.
  // Prunes against ALL tasks (not the search-filtered view) so filtering the
  // list never silently unselects still-valid files.
  useEffect(() => {
    setSelected((s) => {
      if (s.size === 0) return s
      const valid = new Set(tasks.filter(downloadable).map((t) => t.id))
      const kept = [...s].filter((id) => valid.has(id))
      return kept.length === s.size ? s : new Set(kept)
    })
  }, [tasks])

  const remove = async (id: string) => {
    const ok = await dialog.confirm({ title: '删除文件', message: '确定删除该文件？此操作不可恢复。', kind: 'confirm', okText: '删除' })
    if (!ok) return
    try {
      await api.deleteFile(id)
      load()
    } catch (e) {
      await dialog.alert({ message: '删除失败：' + (e as Error).message, kind: 'error' })
    }
  }

  return (
    <>
      <div className="max-w-7xl mx-auto">
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <h1 className="text-xl font-bold text-gray-800">文件管理</h1>
          <span className="text-xs text-gray-400">
            {!user ? '请先登录' : loadErr ? `加载失败：${loadErr}` : `${tasks.length} 个文件 · 占用 ${formatBytes(totalBytes)}`}
          </span>
          <div className="ml-auto relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 w-3.5 h-3.5" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索文件名…"
              className="border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm w-64 focus:outline-none focus:border-indigo-300"
            />
          </div>
        </div>
        {!user ? (
          <div className="py-16 text-center">
            <LogIn className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">登录后查看所有文件</p>
          </div>
        ) : (
        <>
        {selected.size > 0 && (
          <div className="flex items-center gap-3 mb-3 p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl">
            <span className="text-xs text-indigo-500 font-semibold">已选 {selected.size} 个</span>
            <button
              onClick={downloadSelected}
              className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> 下载选中（{selected.size}）
            </button>
            <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:text-gray-600">取消选择</button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-300 border-b border-gray-100">
              <tr>
                <th className="w-10 text-center"><input ref={(el) => { if (el) el.indeterminate = !allSelected && filteredDownloadable.some((t) => selected.has(t.id)) }} type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-indigo-500 align-middle" /></th>
                <th className="text-left py-2 pl-2">文件名</th>
                <th className="text-left">类型</th>
                <th className="text-left">状态</th>
                <th className="text-right">原始大小</th>
                <th className="text-right">输出大小</th>
                <th className="text-left pl-4">创建时间</th>
                <th className="text-left">最后访问</th>
                <th className="text-right pr-2">操作</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="py-12 text-center text-gray-300">暂无文件</td></tr>
              ) : (
                filtered.map((t) => {
                  const isDone = t.status === 'done' && !!t.output
                  const isFailed = t.status === 'failed'
                  const click = isDone ? () => setCompareTask(t) : isFailed ? () => setErrorTask(t) : undefined
                  return (
                    <tr
                      key={t.id}
                      className={`border-b border-gray-50 ${isDone ? 'hover:bg-indigo-50/30 cursor-pointer' : isFailed ? 'hover:bg-red-50/40 cursor-pointer' : 'hover:bg-indigo-50/30'}`}
                      onClick={click}
                    >
                      <td className="w-10 text-center" onClick={(e) => e.stopPropagation()}>
                        {isDone && (
                          <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="accent-indigo-500 align-middle" />
                        )}
                      </td>
                      <td className="py-3 pl-2">
                        <span className="relative inline-block w-8 h-8 bg-gray-50 rounded-lg border border-gray-100 overflow-hidden align-middle mr-2">
                          {t.type === 'watermark' ? <Eraser className="w-4 h-4 text-indigo-400 absolute inset-0 m-auto" /> : <ImageIcon className="w-4 h-4 text-indigo-400 absolute inset-0 m-auto" />}
                          <img src={api.thumbnailUrl(t.id)} loading="lazy" alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        </span>
                        <span className="align-middle">{t.input.filename}</span>
                      </td>
                      <td>
                        {t.type === 'compress'
                          ? <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-500 rounded-full">压缩</span>
                          : <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-500 rounded-full">去水印</span>}
                      </td>
                      <td><StatusLabel s={t.status} /></td>
                      <td className="text-right text-gray-500">{formatBytes(t.input.size)}</td>
                      <td className="text-right text-gray-500">{formatBytes(t.output?.size ?? null)}</td>
                      <td className="pl-4 text-gray-500 text-xs">{formatDate(t.created_at)}</td>
                      <td className="text-gray-500 text-xs">{formatDate(t.last_accessed_at)}</td>
                      <td className="text-right pr-2">
                        {isDone && (
                          <button onClick={(e) => { e.stopPropagation(); setCompareTask(t) }} className="text-indigo-500 hover:text-indigo-700 mr-3" title="前后对比">
                            <ArrowLeftRight className="w-4 h-4 inline" />
                          </button>
                        )}
                        {isFailed && (
                          <button onClick={(e) => { e.stopPropagation(); setErrorTask(t) }} className="text-red-500 hover:text-red-700 mr-3" title="错误详情">
                            <AlertCircle className="w-4 h-4 inline" />
                          </button>
                        )}
                        {t.output && (
                          <a href={api.downloadUrl(t.id)} onClick={(e) => e.stopPropagation()} className="text-indigo-500 mr-3" title="下载">
                            <Download className="w-4 h-4 inline" />
                          </a>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); remove(t.id) }} className="text-red-400 hover:text-red-600" title="删除">
                          <Trash2 className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        </>
        )}
      </div>
      </div>

      {compareTask && <CompareModal task={compareTask} onClose={() => setCompareTask(null)} />}
      {errorTask && <ErrorModal task={errorTask} onClose={() => setErrorTask(null)} />}
    </>
  )
}

function StatusLabel({ s }: { s: Task['status'] }) {
  if (s === 'done') return <span className="text-xs text-green-500">完成</span>
  if (s === 'processing') return <span className="text-xs text-blue-500">处理中</span>
  if (s === 'failed') return <span className="text-xs text-red-500">失败</span>
  return <span className="text-xs text-gray-400">等待中</span>
}
