import { CalendarDays, Download, FileSpreadsheet } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { StatCard } from '../../components/ui/StatCard'
import { Spinner } from '../../components/ui/Spinner'
import { useAdminReportData } from '../../hooks/useAdminReportData'
import { exportAdminOperationalReport, type ReportPeriod } from '../../lib/reportWorkbook'
import { formatUGX } from '../../lib/utils'

export default function AdminReports() {
  const { data, loading, error } = useAdminReportData()

  const totalFuelCost = data.refills.reduce((sum, row) => sum + Number(row.cost), 0)
  const totalServiceCost = data.services.reduce((sum, row) => sum + Number(row.cost ?? 0), 0)
  const totalRepairCost = data.repairs.reduce((sum, row) => sum + Number(row.cost ?? 0), 0)
  const totalUtilityCost =
    data.subscriptions.reduce((sum, row) => sum + Number(row.amount), 0) +
    data.purchases.reduce((sum, row) => sum + Number(row.amount), 0)

  const exportReport = (period: ReportPeriod) => {
    exportAdminOperationalReport(data, period)
  }

  const reports = [
    {
      period: 'weekly' as const,
      title: 'Weekly Admin Excel Report',
      description: 'Current week totals and detailed entries across all active branches.',
    },
    {
      period: 'monthly' as const,
      title: 'Monthly Admin Excel Report',
      description: 'Current month totals and detailed entries across all active branches.',
    },
  ]

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size={28} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Reports</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Download Excel reports for all active branches.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-900/10 dark:text-red-300">{error}</div>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Branches" value={String(data.branches.length)} icon={<FileSpreadsheet size={18} />} />
        <StatCard label="Fuel Cost Recorded" value={formatUGX(totalFuelCost)} icon={<FileSpreadsheet size={18} />} accent="amber" />
        <StatCard label="Service Cost Recorded" value={formatUGX(totalServiceCost)} icon={<FileSpreadsheet size={18} />} accent="green" />
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
                <p className="mt-2 text-xs text-slate-400">Includes Summary, Branch Totals, Power, Fuel, Servicing, and Utilities sheets.</p>
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
