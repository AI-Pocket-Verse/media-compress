import { AlertTriangle } from 'lucide-react'

import { useI18n } from '../i18n'

// Shown when the server's ffmpeg/ffprobe can't run; uploads are rejected with
// 503 ffmpeg_unavailable until it is fixed.
export function FfmpegBanner({ ok }: { ok: boolean }) {
  const { t } = useI18n()
  if (ok) return null
  return (
    <div className="flex items-start gap-2 mb-5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{t('ffmpeg.unavailable')}</span>
    </div>
  )
}
