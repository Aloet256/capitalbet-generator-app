import { cn } from '../../lib/utils'

export function Badge({
  children,
  tone = 'slate',
}: {
  children: React.ReactNode
  tone?: 'slate' | 'green' | 'amber' | 'red' | 'brand'
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    amber: 'bg-gold-100 text-gold-800 dark:bg-gold-500/20 dark:text-gold-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    brand: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-400',
  }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone])}>
      {children}
    </span>
  )
}
