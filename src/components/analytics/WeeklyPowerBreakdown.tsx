import { useState } from 'react'
import { ChevronDown, ChevronUp, Clock3, Zap } from 'lucide-react'
import type { DailyPowerStat } from '../../hooks/useDashboardStats'
import { Badge } from '../ui/Badge'
import { formatDate, formatMinutes } from '../../lib/utils'

export function WeeklyPowerBreakdown({ data }: { data: DailyPowerStat[] }) {
  const [openDate, setOpenDate] = useState<string | null>(null)

  return (
    <div className="card">
      <div className="mb-4">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Daily Power Summary — Monday to Sunday</h3>
        <p className="text-xs text-slate-400 mt-1">Click any day to see the hourly generator minutes and outage starts.</p>
      </div>

      <div className="space-y-2">
        {data.map((day) => {
          const open = openDate === day.date
          const activeHours = day.hourly.filter((h) => h.minutes > 0 || h.outages > 0)
          return (
            <div key={day.date} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenDate(open ? null : day.date)}
                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-100">
                    {day.label} <span className="text-xs font-normal text-slate-400">{formatDate(day.date)}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Zap size={13} /> {day.outages} outage(s)</span>
                    <span className="flex items-center gap-1"><Clock3 size={13} /> {formatMinutes(day.minutes)}</span>
                  </div>
                </div>
                {open ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
              </button>

              {open && (
                <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-3">
                  {activeHours.length === 0 ? (
                    <p className="text-sm text-slate-400">No generator activity recorded for this day.</p>
                  ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {activeHours.map((hour) => (
                        <div key={hour.hour} className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{hour.hour}</span>
                            {hour.outages > 0 && <Badge tone="red">{hour.outages} start{hour.outages > 1 ? 's' : ''}</Badge>}
                          </div>
                          <p className="text-xs text-slate-500 mt-1">Generator: {formatMinutes(hour.minutes)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
