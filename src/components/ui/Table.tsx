import type { ReactNode } from 'react'

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="min-w-full text-sm text-slate-700 dark:text-slate-100">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800">
            {headers.map((h) => (
              <th key={h} className="text-left font-semibold text-slate-600 dark:text-slate-300 py-2.5 pr-4 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">{children}</tbody>
      </table>
    </div>
  )
}
