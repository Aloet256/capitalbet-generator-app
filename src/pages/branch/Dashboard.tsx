import { Zap, Flame, AlertTriangle, Wrench, Tv, Lightbulb, Gauge } from 'lucide-react'
import { useBranchDevice } from '../../context/BranchDeviceContext'
import { useDashboardStats } from '../../hooks/useDashboardStats'
import { useServices } from '../../hooks/useServices'
import { useDstv } from '../../hooks/useDstv'
import { useYaka } from '../../hooks/useYaka'
import { StatCard } from '../../components/ui/StatCard'
import { GeneratorTimeChart } from '../../components/charts/GeneratorTimeChart'
import { FuelCostChart } from '../../components/charts/FuelCostChart'
import { WeeklyPowerBreakdown } from '../../components/analytics/WeeklyPowerBreakdown'
import { Badge } from '../../components/ui/Badge'
import { formatMinutes, formatUGX, formatDate, daysUntil } from '../../lib/utils'

export default function Dashboard() {
  const { branch } = useBranchDevice()
  const branchId = branch?.id ?? null
  const { stats, weeklyChart, dailyBreakdown, monthlyFuelChart, ongoing, loading } = useDashboardStats(branchId)
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
          <p className="text-sm text-slate-500 dark:text-slate-400">{branch?.name} — {branch?.region}</p>
        </div>
        {ongoing && (
          <Badge tone="red">
            <span className="flex items-center gap-1.5">
              <AlertTriangle size={14} /> Power outage ongoing
            </span>
          </Badge>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Today's Generator Time" value={formatMinutes(stats.today.hours * 60)} icon={<Zap size={18} />} sub={`${stats.today.outages} outage(s)`} />
        <StatCard label="This Week" value={formatMinutes(stats.week.hours * 60)} icon={<Zap size={18} />} accent="green" sub={`${stats.week.outages} outage(s)`} />
        <StatCard label="This Month" value={formatMinutes(stats.month.hours * 60)} icon={<Zap size={18} />} accent="amber" sub={`${stats.month.outages} outage(s)`} />
        <StatCard label="This Year" value={formatMinutes(stats.year.hours * 60)} icon={<Zap size={18} />} accent="brand" sub={`${stats.year.outages} outage(s)`} />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Fuel refill summary</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Today" value={`${stats.today.fuelLitres.toFixed(1)} L`} icon={<Gauge size={18} />} sub={`${stats.today.fuelRefills} refill(s) · ${formatUGX(stats.today.fuelCost)}`} />
          <StatCard label="This Week" value={`${stats.week.fuelLitres.toFixed(1)} L`} icon={<Flame size={18} />} accent="green" sub={`${stats.week.fuelRefills} refill(s) · ${formatUGX(stats.week.fuelCost)}`} />
          <StatCard label="This Month" value={`${stats.month.fuelLitres.toFixed(1)} L`} icon={<Gauge size={18} />} accent="amber" sub={`${stats.month.fuelRefills} refill(s) · ${formatUGX(stats.month.fuelCost)}`} />
          <StatCard label="This Year" value={`${stats.year.fuelLitres.toFixed(1)} L`} icon={<Flame size={18} />} sub={`${stats.year.fuelRefills} refill(s) · ${formatUGX(stats.year.fuelCost)}`} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Next Service"
          value={latestService ? formatDate(latestService.next_service_date) : 'Not scheduled'}
          icon={<Wrench size={18} />}
          accent={serviceDays !== null && serviceDays <= 5 ? 'red' : 'brand'}
          sub={serviceDays !== null ? (serviceDays >= 0 ? `in ${serviceDays} day(s)` : `${Math.abs(serviceDays)} day(s) overdue`) : undefined}
        />
        <StatCard
          label="DSTV Renewal"
          value={latestDstv ? formatDate(latestDstv.renewal_date) : 'No subscription'}
          icon={<Tv size={18} />}
          accent={dstvDays !== null && dstvDays <= 5 ? 'red' : 'brand'}
          sub={dstvDays !== null ? (dstvDays >= 0 ? `in ${dstvDays} day(s)` : `${Math.abs(dstvDays)} day(s) overdue`) : undefined}
        />
        <StatCard
          label="Next Yaka Reload"
          value={latestYaka ? formatDate(latestYaka.expected_reload_date) : 'No purchase'}
          icon={<Lightbulb size={18} />}
          accent={yakaDays !== null && yakaDays <= 3 ? 'red' : 'brand'}
          sub={yakaDays !== null ? (yakaDays >= 0 ? `in ${yakaDays} day(s)` : `${Math.abs(yakaDays)} day(s) overdue`) : undefined}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">Generator Time — This Week</h3>
          <p className="text-xs text-slate-400 mb-3">Hours run per day, Monday to Sunday</p>
          {loading ? <div className="h-64" /> : <GeneratorTimeChart data={weeklyChart.map((d) => ({ label: d.label, hours: d.hours }))} />}
        </div>
        <div className="card">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">Fuel Cost — Last 6 Months</h3>
          <p className="text-xs text-slate-400 mb-3">Total fuel spend per month</p>
          {loading ? <div className="h-64" /> : <FuelCostChart data={monthlyFuelChart} />}
        </div>
      </div>

      <WeeklyPowerBreakdown data={dailyBreakdown} />

      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb size={18} className="text-brand-600" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Yaka Monthly Status</h3>
        </div>
        {latestYaka ? (
          <div className="grid sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-400">Last purchase</p>
              <p className="font-medium text-slate-800 dark:text-slate-100">{formatDate(latestYaka.purchase_date)}</p>
            </div>
            <div>
              <p className="text-slate-400">Units bought</p>
              <p className="font-medium text-slate-800 dark:text-slate-100">{latestYaka.units} kWh</p>
            </div>
            <div>
              <p className="text-slate-400">Amount</p>
              <p className="font-medium text-slate-800 dark:text-slate-100">{formatUGX(latestYaka.amount)}</p>
            </div>
            <div>
              <p className="text-slate-400">Expected next reload</p>
              <p className="font-medium text-slate-800 dark:text-slate-100">{formatDate(latestYaka.expected_reload_date)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No Yaka purchases recorded yet.</p>
        )}
      </div>
    </div>
  )
}
