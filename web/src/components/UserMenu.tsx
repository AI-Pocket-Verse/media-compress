import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { UserMenu as SsoUserMenu, useAuth } from '@media-compress/auth-client-web'

import { useI18n } from '../i18n'

/**
 * 右上角身份菜单 —— 复用共享的 `<UserMenu>`，配置为：
 *   - 触发器只显示头像（avatarOnly），不显示姓名；
 *   - 弹窗的身份明细替换为 USER_ID + OPEN_ID（各自点击复制），不展示手机号；
 *   - 保留「设置」入口（→ /settings）。
 */
export function UserMenu() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useI18n()
  const userId = user?.id ?? null
  const openId = user?.open_id ?? null
  return (
    <SsoUserMenu
      onSettingsClick={() => navigate('/settings')}
      subtitle={<IdentityIds userId={userId} openId={openId} />}
      avatarOnly
      settingsLabel={t('nav.settings')}
      logoutLabel={t('nav.logout')}
      loginLabel={t('nav.login')}
      localUserName={t('nav.localUser')}
    />
  )
}

// 弹窗身份明细：USER_ID + OPEN_ID，各自点击复制；替换默认的手机号/邮箱行。
function IdentityIds({ userId, openId }: { userId: string | null; openId: string | null }) {
  return (
    <div className="mt-0.5 space-y-1">
      <CopyId label="USER_ID" value={userId} />
      <CopyId label="OPEN_ID" value={openId} />
    </div>
  )
}

function CopyId({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false)
  const { t } = useI18n()
  if (!value) return null
  const copy = () => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {
        /* clipboard 被禁用（如 http）—— title 提示仍可见完整值 */
      })
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={t('nav.copyIdTitle', { label, value })}
      className="flex w-full items-center gap-1.5 text-left"
    >
      <span className="w-[58px] shrink-0 text-[10px] uppercase tracking-wide text-gray-400">{label}</span>
      <span className="flex-1 truncate font-mono text-[11px] text-gray-500">{value}</span>
      <span className={`shrink-0 text-[10px] ${copied ? 'text-emerald-500' : 'text-indigo-400'}`}>
        {copied ? t('common.copied') : t('common.copy')}
      </span>
    </button>
  )
}
