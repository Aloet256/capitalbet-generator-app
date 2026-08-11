import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, SlidersHorizontal, Menu, X, LogOut, Bell, FileBarChart } from 'lucide-react'
import { useState } from 'react'
import { ThemeToggle } from '../ui/ThemeToggle'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { useAdminEntryFeed } from '../../hooks/useAdminEntryFeed'
import { BrandLogo } from '../BrandLogo'

const NAV = [
  { to: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/reports', label: 'Reports', icon: FileBarChart },
  { to: '/admin/devices', label: 'Device Requests', icon: Users },
  { to: '/admin/settings', label: 'Admin Settings', icon: SlidersHorizontal },
]

export function AdminLayout() {
  const { admin, signOut } = useAdminAuth()
  const { newEntries } = useAdminEntryFeed()
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()
  const newEntryCount = newEntries.length

  const handleSignOut = async () => {
    await signOut()
    navigate('/admin/login')
  }

  return (
    <div className="min-h-screen flex bg-[#fff8f4] text-slate-900 dark:bg-[#070a12] dark:text-slate-100">
      <aside
        className={`fixed lg:static z-40 inset-y-0 left-0 w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200 dark:border-slate-800">
          <BrandLogo size="lg" fullWidth className="mr-3 flex-1" />
          <button className="lg:hidden text-slate-500" onClick={() => setMobileOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Signed in as</p>
          <p className="font-semibold text-slate-900 dark:text-white truncate mt-1">{admin?.full_name ?? '—'}</p>
          <p className="text-xs text-slate-400 truncate">{admin?.email}</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm shadow-brand-900/20'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-brand-50 dark:hover:bg-brand-950/40'
                }`
              }
            >
              <span className="flex items-center gap-3">
                <item.icon size={18} />
                {item.label}
              </span>
              {item.to === '/admin/dashboard' && newEntryCount > 0 && (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {newEntryCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900 flex items-center justify-between px-4 lg:px-8">
          <button className="lg:hidden text-slate-600 dark:text-slate-300" onClick={() => setMobileOpen(true)}>
            <Menu size={22} />
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/dashboard')}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition hover:bg-brand-100 dark:bg-brand-950/50 dark:text-gold-300 dark:hover:bg-brand-900/60"
              aria-label="View new branch entries"
              title="View new branch entries"
            >
              <Bell size={18} />
              {newEntryCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {newEntryCount}
                </span>
              )}
            </button>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
