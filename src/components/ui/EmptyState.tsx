import type { ReactNode } from 'react'

export function EmptyState({ icon, title, description }: { icon?: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 text-slate-400">
      {icon && <div className="mb-3 opacity-60">{icon}</div>}
      <p className="font-medium text-slate-500 dark:text-slate-400">{title}</p>
      {description && <p className="text-sm mt-1 max-w-xs">{description}</p>}
    </div>
  )
}
