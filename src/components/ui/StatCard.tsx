import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function StatCard({
  label,
  value,
  icon,
  sub,
  accent = 'brand',
}: {
  label: string
  value: string
  icon?: ReactNode
  sub?: string
  accent?: 'brand' | 'green' | 'amber' | 'red'
}) {
  const accentMap = {
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    amber: 'bg-gold-100 text-gold-800 dark:bg-gold-500/20 dark:text-gold-300',
    red: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  }
  return (
    <div className="card flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium truncate">{label}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 truncate">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
      {icon && <div className={cn('rounded-xl p-2.5 shrink-0', accentMap[accent])}>{icon}</div>}
    </div>
  )
}
