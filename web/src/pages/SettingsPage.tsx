import { Clock, HardDrive, Info, ShieldCheck, Terminal, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { api } from '../lib/api'
import { formatBytes } from '../lib/format'

export function SettingsPage() {
  const [used, setUsed] = useState(0)
  const [count, setCount] = useState(0)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const max = 5 * 1024 ** 3

  useEffect(() => {
    api.listFiles().then((body) => {
      setUsed(body.total_bytes || 0)
      setCount(body.tasks.length)
    }).catch((e) => setLoadErr((e as Error).message))
  }, [])

  const pct = Math.min(100, Math.round((used / max) * 100))

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="card p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-indigo-400" /> 存储用量
        </h2>
        <div className="flex justify-between text-sm text-gray-500 mb-2">
          <span>当前占用</span>
          <span>{loadErr ? '加载失败' : `${formatBytes(used)} / ${formatBytes(max)} (${pct}%)`}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full">
          <div className="h-2 bg-gradient-to-r from-indigo-400 to-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-3">共 {count} 个任务记录</p>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-indigo-400" /> 自动清理策略
        </h2>
        <ul className="text-sm text-gray-600 space-y-3">
          <li className="flex items-start gap-3"><Clock className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" /><span><strong className="text-gray-800">180 天上限：</strong>文件创建时间超过 180 天，无条件清理（不受最近访问保护）</span></li>
          <li className="flex items-start gap-3"><HardDrive className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" /><span><strong className="text-gray-800">5 GB 阈值：</strong>uploads + outputs 总大小超过 5 GB 触发 LRU 清理</span></li>
          <li className="flex items-start gap-3"><ShieldCheck className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /><span><strong className="text-gray-800">30 天保护期：</strong>最近 30 天内访问过的文件受保护（180 天上限除外）</span></li>
          <li className="flex items-start gap-3"><Trash2 className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" /><span><strong className="text-gray-800">单次释放：</strong>每次触发清理至少释放 1 GB 空间或满足阈值后停止</span></li>
        </ul>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
          <Terminal className="w-4 h-4 text-indigo-400" /> FFmpeg 命令清单
        </h2>
        <p className="text-xs text-gray-400 mb-5">每个预设对应的实际命令模板。占位符 <code>{'{q}'}</code>、<code>{'{crf}'}</code>、<code>{'{x,y,w,h}'}</code> 在运行时填入实际值。</p>
        <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs leading-relaxed font-mono overflow-x-auto whitespace-pre-wrap">
{`# 图片简单模式 — JPEG
ffmpeg -y -i input.jpg -q:v {4|10|17} output.jpg

# 图片简单模式 — WebP
ffmpeg -y -i input.png -quality {90|75|50} output.webp

# 图片移动端
ffmpeg -y -i input.png -vf "scale='min(1080,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease" -quality 80 output.webp

# 视频简单模式 — H.264
ffmpeg -y -i input.mp4 -c:v libx264 -crf {18|23|35} {audio_flags} output.mp4

# 视频移动端
ffmpeg -y -i input.mp4 -vf "scale=-2:720,fps=30" -c:v libx264 -preset medium -crf 23 -an -movflags +faststart output.mp4

# 去水印
ffmpeg -y -i input.jpg -vf "delogo=x={x}:y={y}:w={w}:h={h}" output.jpg`}
        </pre>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Info className="w-4 h-4 text-indigo-400" /> 关于
        </h2>
        <dl className="text-sm space-y-2">
          <div className="flex gap-3"><dt className="text-gray-400 w-24">产品</dt><dd className="text-gray-700">Media Compress</dd></div>
          <div className="flex gap-3"><dt className="text-gray-400 w-24">版本</dt><dd className="text-gray-700">V1.0</dd></div>
          <div className="flex gap-3"><dt className="text-gray-400 w-24">处理引擎</dt><dd className="text-gray-700">FFmpeg · libwebp · libx264 · delogo</dd></div>
          <div className="flex gap-3"><dt className="text-gray-400 w-24">轮询间隔</dt><dd className="text-gray-700">2 秒</dd></div>
          <div className="flex gap-3"><dt className="text-gray-400 w-24">并发数</dt><dd className="text-gray-700">1（依次执行，可通过 WORKER_COUNT 调整）</dd></div>
        </dl>
      </div>
    </div>
  )
}
