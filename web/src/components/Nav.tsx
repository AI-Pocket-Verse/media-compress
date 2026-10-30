import { FolderOpen, Minimize2, Wand2 } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { UserMenu } from './UserMenu'

export function Nav() {
  return (
    <nav className="bg-white/90 backdrop-blur border-b border-indigo-50 px-8 py-4 flex items-center justify-between sticky top-0 z-20">
      <NavLink to="/" className="flex items-center gap-2.5">
        <span aria-hidden="true" className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center logo-anim">
          <Minimize2 className="w-4 h-4 text-white" />
        </span>
        <span className="font-extrabold text-gray-900 text-base">Jeman 媒体工具箱</span>
      </NavLink>
      <div className="flex items-center gap-1 text-sm">
        <NavLink to="/" end className={navCls}>
          <Wand2 className="inline w-4 h-4 mr-1.5 text-indigo-400" />压缩
        </NavLink>
        <NavLink to="/files" className={navCls}>
          <FolderOpen className="inline w-4 h-4 mr-1.5 text-indigo-300" />文件管理
        </NavLink>

        <div className="w-px h-5 bg-gray-200 mx-2" />

        <UserMenu />
      </div>
    </nav>
  )
}

function navCls({ isActive }: { isActive: boolean }): string {
  return isActive
    ? 'px-4 py-2 rounded-xl bg-indigo-50 text-indigo-500 font-medium'
    : 'px-4 py-2 rounded-xl hover:bg-indigo-50 text-gray-500 transition-colors'
}
