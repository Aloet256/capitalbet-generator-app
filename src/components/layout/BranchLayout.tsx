import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Zap, Wrench, Tv, FileBarChart, Bell, Menu, X, Building2, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { ThemeToggle } from '../ui/ThemeToggle'
import { useBranchDevice } from '../../context/BranchDeviceContext'
import { useNotifications } from '../../hooks/useNotifications'
import { Badge } from '../ui/Badge'
import { BrandLogo } from '../BrandLogo'

const NAV = [
  { to: '/branch/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/branch/power', label: 'Generator & Power', icon: Zap },
  { to: '/branch/servicing', label: 'Servicing & Repairs', icon: Wrench },
  { to: '/branch/utilities', label: 'Utilities', icon: Tv },
  { to: '/branch/reports', label: 'Reports', icon: FileBarChart },
  { to: '/branch/notifications', label: 'Notifications', icon: Bell },
]

export function BranchLayout() {
  const { branch } = useBranchDevice()
  const { unreadCount } = useNotifications(branch?.id ?? null)
  const [mobileOpen, setMobileOpen] = useState(false)

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
          <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Locked branch</p>
          <div className="flex items-center gap-2 mt-1">
            <Building2 size={16} className="text-brand-600" />
            <p className="font-semibold text-slate-900 dark:text-white truncate">{branch?.name}</p>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{branch?.region}</p>
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
              {item.label === 'Notifications' && unreadCount > 0 && <Badge tone="red">{unreadCount}</Badge>}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 flex items-start gap-2">
          <LockKeyhole size={15} className="shrink-0 mt-0.5" />
          <span>This computer cannot change to another branch.</span>
        </div>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900 flex items-center justify-between px-4 lg:px-8">
          <button className="lg:hidden text-slate-600 dark:text-slate-300" onClick={() => setMobileOpen(true)}>
            <Menu size={22} />
          </button>
          <div className="hidden lg:block" />
          <ThemeToggle />
        </header>
        <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
