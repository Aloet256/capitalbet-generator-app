import { Download, FileSpreadsheet, CalendarDays } from 'lucide-react'
import { useBranchDevice } from '../../context/BranchDeviceContext'
import { usePowerSessions } from '../../hooks/usePowerSessions'
import { useFuelRefills } from '../../hooks/useFuelRefills'
import { useServices } from '../../hooks/useServices'
import { useRepairs } from '../../hooks/useRepairs'
import { useDstv } from '../../hooks/useDstv'
import { useYaka } from '../../hooks/useYaka'
import { Button } from '../../components/ui/Button'
import { StatCard } from '../../components/ui/StatCard'
import { exportBranchOperationalReport, type ReportPeriod } from '../../lib/reportWorkbook'
import { formatUGX } from '../../lib/utils'

export default function Reports() {
  const { branch } = useBranchDevice()
  const branchId = branch?.id ?? null
  const { sessions } = usePowerSessions(branchId)
  const { refills } = useFuelRefills(branchId)
  const { services } = useServices(branchId)
  const { repairs } = useRepairs(branchId)
  const { subscriptions } = useDstv(branchId)
  const { purchases } = useYaka(branchId)

  const totalFuelCost = refills.reduce((sum, row) => sum + Number(row.cost), 0)
  const totalRepairCost = repairs.reduce((sum, row) => sum + Number(row.cost ?? 0), 0)
  const totalUtilityCost =
    subscriptions.reduce((sum, row) => sum + Number(row.amount), 0) +
    purchases.reduce((sum, row) => sum + Number(row.amount), 0)

  const exportReport = (period: ReportPeriod) => {
    if (!branch) return
    exportBranchOperationalReport({ branch, sessions, refills, services, repairs, subscriptions, purchases }, period)
  }

  const reports = [
    {
      period: 'weekly' as const,
      title: 'Weekly Excel Report',
      description: 'Current week totals, daily breakdown, and all branch entries for this week.',
    },
    {
      period: 'monthly' as const,
      title: 'Monthly Excel Report',
      description: 'Current month totals, daily breakdown, and all branch entries for this month.',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Reports</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Download Excel reports for {branch?.name}.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard label="Fuel Cost Recorded" value={formatUGX(totalFuelCost)} icon={<FileSpreadsheet size={18} />} accent="amber" />
        <StatCard label="Repair Cost Recorded" value={formatUGX(totalRepairCost)} icon={<FileSpreadsheet size={18} />} accent="red" />
        <StatCard label="Utility Cost Recorded" value={formatUGX(totalUtilityCost)} icon={<FileSpreadsheet size={18} />} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {reports.map((report) => (
          <div key={report.period} className="card flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-brand-100 p-2.5 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                <CalendarDays size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">{report.title}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{report.description}</p>
                <p className="mt-2 text-xs text-slate-400">Includes Summary, Daily Breakdown, Power, Fuel, Servicing, and Utilities sheets.</p>
              </div>
            </div>
            <Button onClick={() => exportReport(report.period)}>
              <Download size={16} /> Download Excel
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
