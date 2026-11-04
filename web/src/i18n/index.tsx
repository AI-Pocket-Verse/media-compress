import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { en, zh, type MessageKey } from './messages'

export type Lang = 'zh' | 'en'
/** 用户在设置页的选择；system 表示跟随浏览器 / 系统语言。 */
export type LangPref = 'system' | Lang
type Params = Record<string, string | number>

const STORAGE_KEY = 'media-compress.lang'
const DICTS: Record<Lang, Record<string, string>> = { zh, en }

/** 浏览器首选语言以 zh 开头用中文，其余一律英文。 */
export function detectLang(languages: readonly string[] = navigator.languages ?? [navigator.language]): Lang {
  return /^zh\b/i.test(languages[0] ?? '') ? 'zh' : 'en'
}

function readPref(): LangPref {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'zh' || v === 'en' || v === 'system') return v
  } catch { /* 隐私模式等场景读不到，按跟随系统处理 */ }
  return 'system'
}

export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  const dict = DICTS[lang]
  const one = params?.n === 1 ? dict[`${key}_one`] : undefined
  const text = one ?? dict[key] ?? zh[key]
  return params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : text
}

interface I18nValue {
  lang: Lang
  pref: LangPref
  setPref: (p: LangPref) => void
  t: (key: MessageKey, params?: Params) => string
  /** 日期时间按当前语言、用户本地时区显示。 */
  formatDate: (iso: string | null | undefined) => string
  /** 接口错误 → 当前语言的提示：认识的错误码用本地化文案，带详情的码追加服务端说明。 */
  errorText: (e: unknown) => string
}

const I18nContext = createContext<I18nValue | null>(null)

// 这些错误码在不同场景下原因不同（如哪种格式、哪个文件），本地化提示后面附上服务端的具体说明。
const DETAILED_CODES = new Set(['unsupported_format', 'upload_failed', 'invalid_options', 'invalid_regions', 'multipart_error'])

export function I18nProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<LangPref>(readPref)
  const [systemLang, setSystemLang] = useState<Lang>(() => detectLang())

  useEffect(() => {
    const onChange = () => setSystemLang(detectLang())
    window.addEventListener('languagechange', onChange)
    return () => window.removeEventListener('languagechange', onChange)
  }, [])

  const lang: Lang = pref === 'system' ? systemLang : pref

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  }, [lang])

  const setPref = useCallback((p: LangPref) => {
    setPrefState(p)
    try { localStorage.setItem(STORAGE_KEY, p) } catch { /* 存不下时本次会话仍生效 */ }
  }, [])

  const value = useMemo<I18nValue>(() => {
    const t = (key: MessageKey, params?: Params) => translate(lang, key, params)
    return {
      lang,
      pref,
      setPref,
      t,
      formatDate: (iso) => {
        if (!iso) return '—'
        try { return new Date(iso).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US') } catch { return String(iso) }
      },
      errorText: (e) => {
        const { code, message } = (e ?? {}) as { code?: string; message?: string }
        const key = `error.${code}` as MessageKey
        if (code && key in zh) return DETAILED_CODES.has(code) && message ? `${t(key)}: ${message}` : t(key)
        return message || String(e)
      },
    }
  }, [lang, pref, setPref])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>')
  return ctx
}
