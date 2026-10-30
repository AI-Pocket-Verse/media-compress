import { AlertTriangle } from 'lucide-react'

// Shown when the server's ffmpeg/ffprobe can't run; uploads are rejected with
// 503 ffmpeg_unavailable until it is fixed.
export function FfmpegBanner({ ok }: { ok: boolean }) {
  if (ok) return null
  return (
    <div className="flex items-start gap-2 mb-5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>服务器的 FFmpeg 无法运行，暂时不能处理文件。请检查 FFmpeg 是否安装，或在 api 配置里设置 FFMPEG_PATH / FFPROBE_PATH，详见 README「FFmpeg 要求」。</span>
    </div>
  )
}
