import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Flame, Gauge, Lightbulb, Tv, Wrench, Zap } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Branch } from '../../types/database'
import { useDashboardStats } from '../../hooks/useDashboardStats'
import { useServices } from '../../hooks/useServices'
import { useRepairs } from '../../hooks/useRepairs'
import { useFuelRefills } from '../../hooks/useFuelRefills'
import { usePowerSessions } from '../../hooks/usePowerSessions'
import { useDstv } from '../../hooks/useDstv'
import { useYaka } from '../../hooks/useYaka'
import { useAdminEntryFeed, type AdminEntryFeedItem } from '../../hooks/useAdminEntryFeed'
import { StatCard } from '../../components/ui/StatCard'
import { GeneratorTimeChart } from '../../components/charts/GeneratorTimeChart'
import { FuelCostChart } from '../../components/charts/FuelCostChart'
import { WeeklyPowerBreakdown } from '../../components/analytics/WeeklyPowerBreakdown'
import { Table } from '../../components/ui/Table'
import { formatDate, formatDateTime, formatMinutes, formatUGX, daysUntil, cn } from '../../lib/utils'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import { Button } from '../../components/ui/Button'
import { exportBranchOperationalReport, type ReportPeriod } from '../../lib/reportWorkbook'

const TABS = ['summary', 'power', 'fuel', 'servicing', 'utilities'] as const
type Tab = (typeof TABS)[number]
type EntryTab = Exclude<Tab, 'summary'>

const TAB_BY_TABLE: Record<AdminEntryFeedItem['table_name'], EntryTab> = {
  power_sessions: 'power',
  fuel_refills: 'fuel',
  services: 'servicing',
  repairs: 'servicing',
  dstv_subscriptions: 'utilities',
  yaka_purchases: 'utilities',
}

const GLOBAL_ENTRY_SEEN_KEY = 'cb_admin_entries_seen_at'
const BRANCH_TAB_SEEN_PREFIX = 'cb_admin_branch_tab_seen_at'

function branchTabSeenKey(branchId: string, tab: EntryTab) {
  return `${BRANCH_TAB_SEEN_PREFIX}:${branchId}:${tab}`
}

function readBranchTabSeenAt(branchId: string, tab: EntryTab) {
  return localStorage.getItem(branchTabSeenKey(branchId, tab)) ?? localStorage.getItem(GLOBAL_ENTRY_SEEN_KEY) ?? new Date().toISOString()
}

export default function BranchDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [branch, setBranch] = useState<Branch | null>(null)
  const [branchError, setBranchError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('summary')
  const [seenVersion, setSeenVersion] = useState(0)

  useEffect(() => {
    if (!id) return
    supabase
      .from('branches')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) setBranchError(error.message)
        else setBranch(data as Branch)
      })
  }, [id])

  const branchId = id ?? null
  const { stats, weeklyChart, dailyBreakdown, monthlyFuelChart, loading, ongoing } = useDashboardStats(branchId)
  const { services } = useServices(branchId)
  const { repairs } = useRepairs(branchId)
  const { refills } = useFuelRefills(branchId)
  const { sessions } = usePowerSessions(branchId)
  const { subscriptions, latest: latestDstv } = useDstv(branchId)
  const { purchases, latest: latestYaka } = useYaka(branchId)
  const { entries: adminEntries } = useAdminEntryFeed()

  const latestService = services[0] ?? null
  const serviceDays = latestService ? daysUntil(latestService.next_service_date) : null
  const dstvDays = latestDstv ? daysUntil(latestDstv.renewal_date) : null
  const yakaDays = latestYaka ? daysUntil(latestYaka.expected_reload_date) : null

  const totalFuelLitres = useMemo(() => refills.reduce((sum, row) => sum + Number(row.litres), 0), [refills])
  const totalFuelCost = useMemo(() => refills.reduce((sum, row) => sum + Number(row.cost), 0), [refills])
  const tabNotifications = useMemo(() => {
    const counts: Record<EntryTab, number> = { power: 0, fuel: 0, servicing: 0, utilities: 0 }
    if (!branchId) return counts

    for (const entry of adminEntries) {
      if (entry.branch_id !== branchId) continue
      const entryTab = TAB_BY_TABLE[entry.table_name]
      const seenAt = readBranchTabSeenAt(branchId, entryTab)
      if (new Date(entry.created_at).getTime() > new Date(seenAt).getTime()) {
        counts[entryTab] += 1
      }
    }

    return counts
  }, [adminEntries, branchId, seenVersion])

  const markTabSeen = (nextTab: Tab) => {
    if (!branchId || nextTab === 'summary') return
    localStorage.setItem(branchTabSeenKey(branchId, nextTab), new Date().toISOString())
    setSeenVersion((version) => version + 1)
  }

  const exportReport = (period: ReportPeriod) => {
    if (!branch) return
    exportBranchOperationalReport({ branch, sessions, refills, services, repairs, subscriptions, purchases }, period)
  }

  if (branchError) {
    return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{branchError}</div>
  }

  if (!branch) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size={28} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/admin/dashboard')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft size={16} /> Back to overview
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{branch.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{branch.region} · Complete branch history</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {ongoing && <Badge tone="red">Power outage ongoing</Badge>}
          <Button variant="secondary" onClick={() => exportReport('weekly')}>
            <Download size={16} /> Weekly Excel
          </Button>
          <Button variant="secondary" onClick={() => exportReport('monthly')}>
            <Download size={16} /> Monthly Excel
          </Button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {TABS.map((item) => (
          <button
            key={item}
            onClick={() => {
              setTab(item)
              markTabSeen(item)
            }}
            className={cn(
              'relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px whitespace-nowrap',
              tab === item ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500'
            )}
          >
            <span>{item}</span>
            {item !== 'summary' && tabNotifications[item] > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                {tabNotifications[item]}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Today" value={formatMinutes(stats.today.hours * 60)} icon={<Zap size={18} />} sub={`${stats.today.outages} outage(s)`} />
            <StatCard label="This Week" value={formatMinutes(stats.week.hours * 60)} icon={<Zap size={18} />} accent="green" sub={`${stats.week.outages} outage(s)`} />
            <StatCard label="This Month" value={formatMinutes(stats.month.hours * 60)} icon={<Zap size={18} />} accent="amber" sub={`${stats.month.outages} outage(s)`} />
            <StatCard label="This Year" value={formatMinutes(stats.year.hours * 60)} icon={<Zap size={18} />} accent="brand" sub={`${stats.year.outages} outage(s)`} />
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Fuel Today" value={`${stats.today.fuelLitres.toFixed(1)} L`} icon={<Gauge size={18} />} sub={`${stats.today.fuelRefills} refill(s) · ${formatUGX(stats.today.fuelCost)}`} />
            <StatCard label="Fuel This Week" value={`${stats.week.fuelLitres.toFixed(1)} L`} icon={<Flame size={18} />} accent="green" sub={`${stats.week.fuelRefills} refill(s) · ${formatUGX(stats.week.fuelCost)}`} />
            <StatCard label="Fuel This Month" value={`${stats.month.fuelLitres.toFixed(1)} L`} icon={<Gauge size={18} />} accent="amber" sub={`${stats.month.fuelRefills} refill(s) · ${formatUGX(stats.month.fuelCost)}`} />
            <StatCard label="Fuel This Year" value={`${stats.year.fuelLitres.toFixed(1)} L`} icon={<Flame size={18} />} sub={`${stats.year.fuelRefills} refill(s) · ${formatUGX(stats.year.fuelCost)}`} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <StatCard label="All Fuel Recorded" value={`${totalFuelLitres.toFixed(1)} L`} icon={<Flame size={18} />} sub={formatUGX(totalFuelCost)} />
            <StatCard label="All Power Sessions" value={String(sessions.length)} icon={<Zap size={18} />} />
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              label="Next Service"
              value={latestService ? formatDate(latestService.next_service_date) : 'Not scheduled'}
              icon={<Wrench size={18} />}
              accent={serviceDays !== null && serviceDays <= 5 ? 'red' : 'brand'}
            />
            <StatCard
              label="DSTV Renewal"
              value={latestDstv ? formatDate(latestDstv.renewal_date) : 'None'}
              icon={<Tv size={18} />}
              accent={dstvDays !== null && dstvDays <= 5 ? 'red' : 'brand'}
            />
            <StatCard
              label="Yaka Reload"
              value={latestYaka ? formatDate(latestYaka.expected_reload_date) : 'None'}
              icon={<Lightbulb size={18} />}
              accent={yakaDays !== null && yakaDays <= 3 ? 'red' : 'brand'}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="card">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Generator Time — This Week</h3>
              {loading ? <div className="h-64" /> : <GeneratorTimeChart data={weeklyChart.map((d) => ({ label: d.label, hours: d.hours }))} />}
            </div>
            <div className="card">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Fuel Cost — Last 6 Months</h3>
              {loading ? <div className="h-64" /> : <FuelCostChart data={monthlyFuelChart} />}
            </div>
          </div>

          <WeeklyPowerBreakdown data={dailyBreakdown} />
        </>
      )}

      {tab === 'power' && (
        <div className="card">
          <div className="mb-3">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">All Power Sessions</h3>
            <p className="text-xs text-slate-400">Every recorded outage for this branch.</p>
          </div>
          {sessions.length === 0 ? (
            <p className="text-sm text-slate-400">No sessions recorded.</p>
          ) : (
            <Table headers={['Date', 'Start', 'End', 'Duration', 'Notes']}>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="py-2.5 pr-4 whitespace-nowrap">{formatDate(s.session_date)}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">{formatDateTime(s.started_at)}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">{s.ended_at ? formatDateTime(s.ended_at) : <Badge tone="red">Ongoing</Badge>}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">{s.duration_minutes === null && s.is_ongoing ? 'Running' : formatMinutes(s.duration_minutes)}</td>
                  <td className="py-2.5 pr-4 max-w-sm">{s.notes ?? '—'}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {tab === 'fuel' && (
        <div className="card">
          <div className="mb-3">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">All Fuel Refills</h3>
            <p className="text-xs text-slate-400">{refills.length} record(s), {totalFuelLitres.toFixed(1)} litres, {formatUGX(totalFuelCost)} total recorded spend.</p>
          </div>
          {refills.length === 0 ? (
            <p className="text-sm text-slate-400">No fuel records.</p>
          ) : (
            <Table headers={['Date', 'Litres', 'Cost', 'Authorized By', 'Remarks']}>
              {refills.map((r) => (
                <tr key={r.id}>
                  <td className="py-2.5 pr-4 whitespace-nowrap">{formatDate(r.refill_date)}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">{r.litres} L</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">{formatUGX(r.cost)}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">{r.authorized_by}</td>
                  <td className="py-2.5 pr-4 max-w-sm">{r.remarks ?? '—'}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {tab === 'servicing' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Complete Servicing History</h3>
            {services.length === 0 ? (
              <p className="text-sm text-slate-400">No service records.</p>
            ) : (
              <Table headers={['Service Date', 'Next Due', 'Technician', 'Phone', 'Company', 'Items/Repaired Done', 'Cost', 'Work Done', 'Remarks']}>
                {services.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{formatDate(s.service_date)}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{formatDate(s.next_service_date)}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{s.technician_name}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{s.technician_phone}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{s.company ?? '—'}</td>
                    <td className="py-2.5 pr-4 max-w-xs">{[s.items_replaced, s.repairs_done].filter(Boolean).join(' / ') || '-'}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{formatUGX(s.cost)}</td>
                    <td className="py-2.5 pr-4 max-w-md">{s.work_done}</td>
                    <td className="py-2.5 pr-4 max-w-sm">{s.remarks ?? '—'}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>

          <div className="card">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Complete Repairs History</h3>
            {repairs.length === 0 ? (
              <p className="text-sm text-slate-400">No repair records.</p>
            ) : (
              <Table headers={['Date', 'Category', 'Description', 'Cost', 'Handled By', 'Remarks']}>
                {repairs.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{formatDate(r.repair_date)}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{r.category}</td>
                    <td className="py-2.5 pr-4 max-w-md">{r.description}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{formatUGX(r.cost)}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{r.handled_by ?? '—'}</td>
                    <td className="py-2.5 pr-4 max-w-sm">{r.remarks ?? '—'}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </div>
      )}

      {tab === 'utilities' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">DSTV History</h3>
            {subscriptions.length === 0 ? (
              <p className="text-sm text-slate-400">No DSTV records.</p>
            ) : (
              <Table headers={['Subscribed', 'Renewal', 'Smart Card', 'Package', 'Amount', 'Receipt', 'Remarks']}>
                {subscriptions.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{formatDate(s.subscription_date)}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{formatDate(s.renewal_date)}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{s.smart_card_number}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{s.package}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{formatUGX(s.amount)}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{s.receipt_number ?? '—'}</td>
                    <td className="py-2.5 pr-4 max-w-sm">{s.remarks ?? '—'}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>

          <div className="card">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Yaka History</h3>
            {purchases.length === 0 ? (
              <p className="text-sm text-slate-400">No Yaka records.</p>
            ) : (
              <Table headers={['Purchase Date', 'Expected Reload', 'Meter', 'Units', 'Amount', 'Receipt', 'Remarks']}>
                {purchases.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{formatDate(p.purchase_date)}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{formatDate(p.expected_reload_date)}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{p.meter_number}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{p.units} kWh</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{formatUGX(p.amount)}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{p.receipt_number ?? '—'}</td>
                    <td className="py-2.5 pr-4 max-w-sm">{p.remarks ?? '—'}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
