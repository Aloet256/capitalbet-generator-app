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
import { daysUntil, formatDate, formatMinutes, formatUGX } from '../../lib/utils'

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
  const { stats, ongoing } = useDashboardStats(branchId)
  const { latest: latestService } = useServices(branchId)
  const { latest: latestDstv } = useDstv(branchId)
  const { latest: latestYaka } = useYaka(branchId)

  const serviceDays = latestService ? daysUntil(latestService.next_service_date) : null
  const dstvDays = latestDstv ? daysUntil(latestDstv.renewal_date) : null
  const yakaDays = latestYaka ? daysUntil(latestYaka.expected_reload_date) : null

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
          <StatCard label="Today" value={formatMinutes(stats.today.hours * 60)} icon={<Zap size={18} />} sub={`${stats.today.outages} outage(s)`} />
          <StatCard label="This Week" value={formatMinutes(stats.week.hours * 60)} icon={<Zap size={18} />} accent="green" sub={`${stats.week.outages} outage(s)`} />
          <StatCard label="This Month" value={formatMinutes(stats.month.hours * 60)} icon={<Zap size={18} />} accent="amber" sub={`${stats.month.outages} outage(s)`} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Fuel</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <StatCard label="Today" value={formatUGX(stats.today.fuelCost)} icon={<Gauge size={18} />} sub={`${stats.today.fuelLitres.toFixed(1)} L - ${stats.today.fuelRefills} refill(s)`} />
          <StatCard label="This Week" value={formatUGX(stats.week.fuelCost)} icon={<Flame size={18} />} accent="green" sub={`${stats.week.fuelLitres.toFixed(1)} L - ${stats.week.fuelRefills} refill(s)`} />
          <StatCard label="This Month" value={formatUGX(stats.month.fuelCost)} icon={<Gauge size={18} />} accent="amber" sub={`${stats.month.fuelLitres.toFixed(1)} L - ${stats.month.fuelRefills} refill(s)`} />
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
    </div>
  )
}
