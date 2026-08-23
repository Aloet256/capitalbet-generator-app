import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Flame, Gauge, Lightbulb, Tv, Wrench, Zap } from 'lucide-react'
import { useBranchDevice } from '../../context/BranchDeviceContext'
import { useDashboardStats } from '../../hooks/useDashboardStats'
import { useServices } from '../../hooks/useServices'
import { useDstv } from '../../hooks/useDstv'
import { useYaka } from '../../hooks/useYaka'
import { StatCard } from '../../components/ui/StatCard'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { daysUntil, formatDate, formatMinutes, formatUGX, startOfMonth, startOfToday, startOfWeek } from '../../lib/utils'
import type { FuelRefill, PowerSession } from '../../types/database'

type DrilldownKind = 'power' | 'fuel'
type DrilldownPeriod = 'today' | 'week' | 'month'
type DrilldownState = { kind: DrilldownKind; period: DrilldownPeriod } | null

function reminderSubtext(days: number | null, empty: string) {
  if (days === null) return empty
  if (days < 0) return `${Math.abs(days)} day(s) overdue`
  if (days === 0) return 'due today'
  return `in ${days} day(s)`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { branch } = useBranchDevice()
  const branchId = branch?.id ?? null
  const { stats, sessions, refills, ongoing } = useDashboardStats(branchId)
  const [drilldown, setDrilldown] = useState<DrilldownState>(null)
  const { latest: latestService } = useServices(branchId)
  const { latest: latestDstv } = useDstv(branchId)
  const { latest: latestYaka } = useYaka(branchId)

  const serviceDays = latestService ? daysUntil(latestService.next_service_date) : null
  const dstvDays = latestDstv ? daysUntil(latestDstv.renewal_date) : null
  const yakaDays = latestYaka ? daysUntil(latestYaka.expected_reload_date) : null
  const drilldownRows = useMemo(() => buildDrilldownRows(drilldown, sessions, refills), [drilldown, sessions, refills])
  const drilldownTitle = drilldown ? `${drilldown.kind === 'power' ? 'Generator time' : 'Fuel'} - ${periodTitle(drilldown.period)}` : ''

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{branch?.name} - {branch?.region}</p>
        </div>
        <div className="flex items-center gap-2">
          {ongoing && (
            <Badge tone="red">
              <span className="flex items-center gap-1.5">
                <AlertTriangle size={14} /> Power outage ongoing
              </span>
            </Badge>
          )}
          <Button variant="secondary" onClick={() => navigate('/branch/reports')}>View More</Button>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Generator time</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <StatCard label="Today" value={formatMinutes(stats.today.hours * 60)} icon={<Zap size={18} />} sub={`${stats.today.outages} outage(s)`} onClick={() => setDrilldown({ kind: 'power', period: 'today' })} />
          <StatCard label="This Week" value={formatMinutes(stats.week.hours * 60)} icon={<Zap size={18} />} accent="green" sub={`${stats.week.outages} outage(s)`} onClick={() => setDrilldown({ kind: 'power', period: 'week' })} />
          <StatCard label="This Month" value={formatMinutes(stats.month.hours * 60)} icon={<Zap size={18} />} accent="amber" sub={`${stats.month.outages} outage(s)`} onClick={() => setDrilldown({ kind: 'power', period: 'month' })} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Fuel</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <StatCard label="Today" value={formatUGX(stats.today.fuelCost)} icon={<Gauge size={18} />} sub={`${stats.today.fuelLitres.toFixed(1)} L - ${stats.today.fuelRefills} refill(s)`} onClick={() => setDrilldown({ kind: 'fuel', period: 'today' })} />
          <StatCard label="This Week" value={formatUGX(stats.week.fuelCost)} icon={<Flame size={18} />} accent="green" sub={`${stats.week.fuelLitres.toFixed(1)} L - ${stats.week.fuelRefills} refill(s)`} onClick={() => setDrilldown({ kind: 'fuel', period: 'week' })} />
          <StatCard label="This Month" value={formatUGX(stats.month.fuelCost)} icon={<Gauge size={18} />} accent="amber" sub={`${stats.month.fuelLitres.toFixed(1)} L - ${stats.month.fuelRefills} refill(s)`} onClick={() => setDrilldown({ kind: 'fuel', period: 'month' })} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Reminders</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            label="Next Service"
            value={latestService ? formatDate(latestService.next_service_date) : 'Not scheduled'}
            icon={<Wrench size={18} />}
            accent={serviceDays !== null && serviceDays <= 5 ? 'red' : 'brand'}
            sub={reminderSubtext(serviceDays, 'No service record yet')}
          />
          <StatCard
            label="DSTV Renewal"
            value={latestDstv ? formatDate(latestDstv.renewal_date) : 'No subscription'}
            icon={<Tv size={18} />}
            accent={dstvDays !== null && dstvDays <= 5 ? 'red' : 'brand'}
            sub={reminderSubtext(dstvDays, 'No DSTV record yet')}
          />
          <StatCard
            label="Yaka Reload"
            value={latestYaka ? formatDate(latestYaka.expected_reload_date) : 'No purchase'}
            icon={<Lightbulb size={18} />}
            accent={yakaDays !== null && yakaDays <= 3 ? 'red' : 'brand'}
            sub={reminderSubtext(yakaDays, 'No Yaka record yet')}
          />
        </div>
      </div>

      <Modal open={Boolean(drilldown)} onClose={() => setDrilldown(null)} title={drilldownTitle}>
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {drilldown?.period === 'today'
              ? 'Today summary with outage count, generator time, fuel cost, and litres.'
              : drilldown?.period === 'week'
                ? 'This week from Monday to Sunday.'
                : 'This month grouped by week.'}
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="py-2 pr-4">Period</th>
                  <th className="py-2 pr-4">Outages</th>
                  <th className="py-2 pr-4">Generator Time</th>
                  <th className="py-2 pr-4">Fuel</th>
                  <th className="py-2 pr-4">Litres</th>
                  <th className="py-2 pr-4">Refills</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {drilldownRows.map((row) => (
                  <tr key={row.label}>
                    <td className="py-3 pr-4 font-medium text-slate-800 dark:text-slate-100">{row.label}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{row.outages}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{formatMinutes(row.minutes)}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{formatUGX(row.fuelCost)}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{row.fuelLitres.toFixed(1)} L</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{row.fuelRefills}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!drilldownRows.length && <p className="text-sm text-slate-400">No records found for this period.</p>}
        </div>
      </Modal>
    </div>
  )
}

type DrilldownRow = {
  label: string
  start: Date
  end: Date
  outages: number
  minutes: number
  fuelCost: number
  fuelLitres: number
  fuelRefills: number
}

function periodTitle(period: DrilldownPeriod) {
  if (period === 'today') return 'Today'
  if (period === 'week') return 'This Week'
  return 'This Month'
}

function buildDrilldownRows(drilldown: DrilldownState, sessions: PowerSession[], refills: FuelRefill[]): DrilldownRow[] {
  if (!drilldown) return []
  const now = new Date()
  const ranges = drilldown.period === 'today'
    ? [rangeRow('Today', startOfToday(), tomorrow(startOfToday()))]
    : drilldown.period === 'week'
      ? weekRows()
      : monthRows()

  return ranges.map((row) => summarizeRange(row, sessions, refills, now))
}

function rangeRow(label: string, start: Date, end: Date): DrilldownRow {
  return { label, start, end, outages: 0, minutes: 0, fuelCost: 0, fuelLitres: 0, fuelRefills: 0 }
}

function tomorrow(date: Date) {
  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  return next
}

function weekRows() {
  const labels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const start = startOfWeek()
  return labels.map((label, index) => {
    const dayStart = new Date(start)
    dayStart.setDate(dayStart.getDate() + index)
    return rangeRow(label, dayStart, tomorrow(dayStart))
  })
}

function monthRows() {
  const rows: DrilldownRow[] = []
  const monthStart = startOfMonth()
  const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
  let start = new Date(monthStart)
  let week = 1

  while (start < nextMonth) {
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    rows.push(rangeRow(`Week ${week}`, start, end > nextMonth ? nextMonth : end))
    start = end
    week += 1
  }
  return rows
}

function summarizeRange(row: DrilldownRow, sessions: PowerSession[], refills: FuelRefill[], now: Date): DrilldownRow {
  const touchingSessions = sessions.filter((session) => {
    const start = new Date(session.started_at)
    const end = session.ended_at ? new Date(session.ended_at) : now
    return start < row.end && end > row.start
  })
  const startedSessions = sessions.filter((session) => {
    const start = new Date(session.started_at)
    return start >= row.start && start < row.end
  })
  const fuelRows = refills.filter((refill) => {
    const date = new Date(`${refill.refill_date}T00:00:00`)
    return date >= row.start && date < row.end
  })

  return {
    ...row,
    outages: startedSessions.length,
    minutes: touchingSessions.reduce((sum, session) => sum + overlapMinutes(session, row.start, row.end, now), 0),
    fuelCost: fuelRows.reduce((sum, refill) => sum + Number(refill.cost), 0),
    fuelLitres: fuelRows.reduce((sum, refill) => sum + Number(refill.litres), 0),
    fuelRefills: fuelRows.length,
  }
}

function overlapMinutes(session: PowerSession, rangeStart: Date, rangeEnd: Date, now: Date): number {
  const start = new Date(session.started_at)
  const end = session.ended_at ? new Date(session.ended_at) : now
  const overlapStart = Math.max(start.getTime(), rangeStart.getTime())
  const overlapEnd = Math.min(end.getTime(), rangeEnd.getTime())
  return Math.max(0, Math.round((overlapEnd - overlapStart) / 60000))
}
