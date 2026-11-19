'use client'

import { useState } from 'react'
import { Home, LogOut, MessageCircle, User, Bell, LifeBuoy, Menu, X, ShieldCheck } from 'lucide-react'
import { useTranslation } from '../lib/useTranslation'
import type { Role } from '../lib/types'
import LanguageSelector from './LanguageSelector'
import Logo from './Logo'
import { useAuth } from '../lib/auth-context'

export default function DashboardShell({
  children,
  role,
  navigate,
}: {
  children: React.ReactNode
  role: Role
  navigate: (route: string) => void
}) {
  const { t, lang, setLang } = useTranslation()
  const { logout, user } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const dashboardRoute =
    role === 'admin'
      ? 'admin-dashboard'
      : role === 'ngo'
      ? 'ngo-dashboard'
      : role === 'volunteer'
        ? 'volunteer-dashboard'
        : 'dashboard'

  const handleLogout = async () => {
    await logout()
    navigate('home')
  }

  return (
    <div className="dashboard-shell min-h-screen flex flex-col md:flex-row bg-[#fbfaf7]">
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-[#0b3c28] text-white sticky top-0 z-30">
        <Logo />
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-white hover:bg-emerald-800 rounded-lg"
          aria-label="Toggle navigation"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } md:block md:w-64 bg-[#0b3c28] text-white p-5 flex flex-col justify-between shrink-0 z-20 md:min-h-screen md:sticky md:top-0`}
      >
        <div className="space-y-6">
          <div className="hidden md:block">
            <Logo />
          </div>

          {user && (
            <div className="p-3.5 bg-emerald-950/70 border border-emerald-800/60 rounded-xl space-y-1">
              <div className="font-bold text-sm text-white truncate">{user.orgName || user.name}</div>
              <div className="text-[11px] text-emerald-300 font-semibold uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                {role} Workspace
              </div>
            </div>
          )}

          <nav className="space-y-1.5">
            <button
              className="side-link active w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-xs sm:text-sm text-white bg-emerald-800/90 hover:bg-emerald-800 transition"
              onClick={() => {
                navigate(dashboardRoute)
                setMobileMenuOpen(false)
              }}
              aria-current="page"
            >
              <Home className="w-4 h-4 text-emerald-300" />
              <span>{t('dashboard.title')}</span>
            </button>

            <button
              className="side-link w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-xs sm:text-sm text-emerald-100 hover:text-white hover:bg-emerald-900 transition"
              onClick={() => {
                navigate('emergency')
                setMobileMenuOpen(false)
              }}
            >
              <LifeBuoy className="w-4 h-4 text-amber-300" />
              <span>Emergency Center</span>
            </button>

            <button
              className="side-link w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-xs sm:text-sm text-emerald-100 hover:text-white hover:bg-emerald-900 transition"
              onClick={() => {
                navigate('chat')
                setMobileMenuOpen(false)
              }}
            >
              <MessageCircle className="w-4 h-4 text-emerald-300" />
              <span>{t('chat.title')}</span>
            </button>

            <button
              className="side-link w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-xs sm:text-sm text-emerald-100 hover:text-white hover:bg-emerald-900 transition"
              onClick={() => {
                navigate('profile')
                setMobileMenuOpen(false)
              }}
            >
              <User className="w-4 h-4 text-emerald-300" />
              <span>{t('dashboard.profile')}</span>
            </button>
          </nav>
        </div>

        <div className="pt-6 border-t border-emerald-900 space-y-3">
          <div className="text-xs text-emerald-200">
            <LanguageSelector value={lang} onChange={setLang} />
          </div>

          <button
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-emerald-200 hover:text-white hover:bg-emerald-900/60 transition"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4" />
            <span>{t('dashboard.logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="dashboard-main flex-1 min-w-0">{children}</div>
    </div>
  )
}

