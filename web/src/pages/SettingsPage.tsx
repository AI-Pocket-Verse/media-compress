import { Clock, HardDrive, Info, Languages, ShieldCheck, Terminal, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useI18n, type LangPref } from '../i18n'
import { api } from '../lib/api'
import { formatBytes } from '../lib/format'

// 语言选项；label 为空时显示「跟随系统」的本地化文案。语言名称用各自的母语书写，任何界面语言下都认得出。
const LANG_OPTIONS: [LangPref, string | null][] = [['system', null], ['zh', '简体中文'], ['en', 'English']]

export function SettingsPage() {
  const { t, pref, setPref, errorText } = useI18n()
  const [used, setUsed] = useState(0)
  const [count, setCount] = useState(0)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const max = 5 * 1024 ** 3

  useEffect(() => {
    api.listFiles().then((body) => {
      setUsed(body.total_bytes || 0)
      setCount(body.tasks.length)
    }).catch((e) => setLoadErr(errorText(e)))
  }, [errorText])

  const pct = Math.min(100, Math.round((used / max) * 100))

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="card p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
          <Languages className="w-4 h-4 text-indigo-400" /> {t('settings.language')}
        </h2>
        <p className="text-xs text-gray-400 mb-4">{t('settings.languageHint')}</p>
        <div className="flex bg-indigo-50 rounded-xl p-1 gap-0.5 text-xs w-fit">
          {LANG_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setPref(value)}
              className={`px-4 py-1.5 rounded-lg font-semibold ${pref === value ? 'bg-indigo-500 text-white' : 'text-indigo-400 hover:text-indigo-500'}`}
            >
              {label ?? t('settings.langSystem')}
            </button>
          ))}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-indigo-400" /> {t('settings.storage')}
        </h2>
        <div className="flex justify-between text-sm text-gray-500 mb-2">
          <span>{t('settings.used')}</span>
          <span>{loadErr ? t('settings.loadFailed') : `${formatBytes(used)} / ${formatBytes(max)} (${pct}%)`}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full">
          <div className="h-2 bg-gradient-to-r from-indigo-400 to-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-3">{t('settings.taskCount', { n: count })}</p>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-indigo-400" /> {t('settings.cleanup')}
        </h2>
        <ul className="text-sm text-gray-600 space-y-3">
          <li className="flex items-start gap-3"><Clock className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" /><span><strong className="text-gray-800">{t('settings.cleanupAgeTitle')}</strong>{t('settings.cleanupAge')}</span></li>
          <li className="flex items-start gap-3"><HardDrive className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" /><span><strong className="text-gray-800">{t('settings.cleanupSizeTitle')}</strong>{t('settings.cleanupSize')}</span></li>
          <li className="flex items-start gap-3"><ShieldCheck className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /><span><strong className="text-gray-800">{t('settings.cleanupProtectTitle')}</strong>{t('settings.cleanupProtect')}</span></li>
          <li className="flex items-start gap-3"><Trash2 className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" /><span><strong className="text-gray-800">{t('settings.cleanupBatchTitle')}</strong>{t('settings.cleanupBatch')}</span></li>
        </ul>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
          <Terminal className="w-4 h-4 text-indigo-400" /> {t('settings.commands')}
        </h2>
        <p className="text-xs text-gray-400 mb-5">{t('settings.commandsHintBefore')}<code>{'{q}'}</code>{t('settings.commandsSep')}<code>{'{crf}'}</code>{t('settings.commandsSep')}<code>{'{x,y,w,h}'}</code>{t('settings.commandsHintAfter')}</p>
        <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs leading-relaxed font-mono overflow-x-auto whitespace-pre-wrap">
{`${t('cmd.imageJpeg')}
ffmpeg -y -i input.jpg -q:v {4|10|17} output.jpg

${t('cmd.imageWebp')}
ffmpeg -y -i input.png -quality {90|75|50} output.webp

${t('cmd.imageApp')}
ffmpeg -y -i input.png -quality 80 output.webp

${t('cmd.video')}
ffmpeg -y -i input.mp4 -c:v libx264 -crf {18|23|35} {audio_flags} output.mp4

${t('cmd.videoApp')}
ffmpeg -y -i input.mp4 -vf "fps=30" -c:v libx264 -preset medium -crf 23 -an -movflags +faststart output.mp4

${t('cmd.watermark')}
ffmpeg -y -i input.jpg -vf "delogo=x={x}:y={y}:w={w}:h={h}" output.jpg`}
        </pre>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Info className="w-4 h-4 text-indigo-400" /> {t('settings.about')}
        </h2>
        <dl className="text-sm space-y-2">
          <div className="flex gap-3"><dt className="text-gray-400 w-24">{t('settings.product')}</dt><dd className="text-gray-700">Media Compress</dd></div>
          <div className="flex gap-3"><dt className="text-gray-400 w-24">{t('settings.version')}</dt><dd className="text-gray-700">V1.0</dd></div>
          <div className="flex gap-3"><dt className="text-gray-400 w-24">{t('settings.engine')}</dt><dd className="text-gray-700">FFmpeg · libwebp · libx264 · delogo</dd></div>
          <div className="flex gap-3"><dt className="text-gray-400 w-24">{t('settings.polling')}</dt><dd className="text-gray-700">{t('settings.pollingValue')}</dd></div>
          <div className="flex gap-3"><dt className="text-gray-400 w-24">{t('settings.concurrency')}</dt><dd className="text-gray-700">{t('settings.concurrencyValue')}</dd></div>
        </dl>
      </div>
    </div>
  )
}
