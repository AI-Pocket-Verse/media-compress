import { Eraser, Wand2 } from 'lucide-react'
import { useState } from 'react'

import { CompressPage } from './CompressPage'
import { WatermarkPage } from './WatermarkPage'

export function HomePage() {
  const [tab, setTab] = useState<'compress' | 'watermark'>('compress')
  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex gap-1 bg-white rounded-2xl p-1 shadow-sm w-fit mb-6">
        <button
          onClick={() => setTab('compress')}
          className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors inline-flex items-center gap-2 ${
            tab === 'compress' ? 'bg-indigo-500 text-white shadow-md' : 'text-gray-400 hover:text-indigo-500'
          }`}
        >
          <Wand2 className="w-4 h-4" /> 压缩
        </button>
        <button
          onClick={() => setTab('watermark')}
          className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-2 ${
            tab === 'watermark' ? 'bg-indigo-500 text-white shadow-md' : 'text-gray-400 hover:text-indigo-500'
          }`}
        >
          <Eraser className="w-4 h-4" /> 去水印
        </button>
      </div>
      {tab === 'compress' ? <CompressPage /> : <WatermarkPage />}
    </div>
  )
}
