import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Flame, Wrench, Users, ChevronRight, ChevronDown, Activity, Search, Bell } from 'lucide-react'
import { useAdminOverview, type BranchSummary } from '../../hooks/useAdminOverview'
import { describeAdminEntry, useAdminEntryFeed } from '../../hooks/useAdminEntryFeed'
import { StatCard } from '../../components/ui/StatCard'
import { Badge } from '../../components/ui/Badge'
import { formatDateTime, formatMinutes, formatUGX } from '../../lib/utils'

export default function AdminDashboard() {
  const { summaries, pendingDevices, totals, loading, error } = useAdminOverview()
  const {
    entries,
    loading: feedLoading,
    error: feedError,
    newEntries,
    newCountByBranch,
    markSeen,
    markEntrySeen,
    isEntrySeen,
  } = useAdminEntryFeed()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [openRegions, setOpenRegions] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return summaries
    return summaries.filter((s) => s.branch.name.toLowerCase().includes(q) || s.branch.region.toLowerCase().includes(q))
  }, [summaries, query])

  const grouped = useMemo(() => {
    const byRegion = new Map<string, BranchSummary[]>()
    for (const summary of filtered) {
      const region = summary.branch.region || 'Unassigned Region'
      byRegion.set(region, [...(byRegion.get(region) ?? []), summary])
    }

    return Array.from(byRegion.entries())
      .map(([region, items]) => ({
        region,
        items,
        outages: items.reduce((sum, item) => sum + item.outagesThisMonth, 0),
        hours: items.reduce((sum, item) => sum + item.hoursThisMonth, 0),
        fuelLitres: items.reduce((sum, item) => sum + item.fuelLitresThisMonth, 0),
        fuelCost: items.reduce((sum, item) => sum + item.fuelCostThisMonth, 0),
        servicesDue: items.filter((item) => item.serviceDueSoon).length,
      }))
      .sort((a, b) => a.region.localeCompare(b.region))
  }, [filtered])

  const toggleRegion = (region: string) => {
    setOpenRegions((prev) => {
      const next = new Set(prev)
      if (next.has(region)) next.delete(region)
      else next.add(region)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Overview</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">General summary of all active branches for the current month.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Power Outages" value={String(totals.outages)} icon={<Activity size={18} />} accent="red" />
        <StatCard label="Generator Time" value={formatMinutes(totals.hours * 60)} icon={<Zap size={18} />} sub={`${summaries.length} branches`} />
        <StatCard label="Fuel Refilled" value={`${totals.fuelLitres.toFixed(1)} L`} icon={<Flame size={18} />} accent="amber" />
        <StatCard label="Fuel Cost" value={formatUGX(totals.fuelCost)} icon={<Flame size={18} />} accent="amber" />
        <StatCard label="Services Due / Overdue" value={String(totals.servicesDue)} icon={<Wrench size={18} />} accent="red" />
      </div>

      {pendingDevices.length > 0 && (
        <div className="card border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-amber-800 dark:text-amber-300">{pendingDevices.length} device(s) awaiting approval</h3>
              <p className="text-sm text-amber-700/80 dark:text-amber-400/80">Review pending branch computers before they can enter operational records.</p>
            </div>
            <button onClick={() => navigate('/admin/devices')} className="btn-secondary shrink-0">
              <Users size={16} /> Review
            </button>
          </div>
        </div>
      )}

      {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div>}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Branches</h3>
            <p className="text-xs text-slate-400">Open any branch for full history and detailed statistics.</p>
          </div>
          <div className="relative sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} className="input pl-9" placeholder="Search branch or region" />
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 py-4">Loading...</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {grouped.map((group) => {
              const isOpen = openRegions.has(group.region)
              const groupNewCount = group.items.reduce((sum, item) => sum + (newCountByBranch.get(item.branch.id) ?? 0), 0)
              return (
                <div key={group.region} className="-mx-5">
                  <button
                    type="button"
                    onClick={() => toggleRegion(group.region)}
                    className="w-full grid grid-cols-[1fr_auto] lg:grid-cols-[1.2fr_repeat(4,minmax(100px,auto))_24px] items-center gap-3 px-5 py-4 text-left bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/40 dark:hover:bg-brand-900/40 border-l-4 border-brand-600 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isOpen ? <ChevronDown size={18} className="text-brand-700 dark:text-gold-300" /> : <ChevronRight size={18} className="text-brand-700 dark:text-gold-300" />}
                      <div className="min-w-0">
                        <p className="font-semibold text-brand-950 dark:text-white truncate">{group.region}</p>
                        <p className="text-xs text-brand-700/70 dark:text-brand-200/80">{group.items.length} branch(es)</p>
                      </div>
                    </div>
                    <span className="hidden lg:block text-sm font-medium text-brand-900 dark:text-slate-100">{group.outages} outage(s)</span>
                    <span className="hidden lg:block text-sm font-medium text-brand-900 dark:text-slate-100">{formatMinutes(group.hours * 60)}</span>
                    <span className="hidden lg:block text-sm font-medium text-brand-900 dark:text-slate-100">{group.fuelLitres.toFixed(1)} L</span>
                    <span className="hidden lg:block text-sm font-medium text-brand-900 dark:text-slate-100">{formatUGX(group.fuelCost)}</span>
                    <div className="flex items-center justify-end gap-2">
                      {groupNewCount > 0 && (
                        <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-red-600 px-2 py-1 text-xs font-bold text-white">
                          {groupNewCount}
                        </span>
                      )}
                      {group.servicesDue > 0 && <Badge tone="amber">{group.servicesDue} due</Badge>}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/70 bg-white dark:bg-slate-950">
                      {group.items.map((s) => (
                        (() => {
                          const branchNewCount = newCountByBranch.get(s.branch.id) ?? 0
                          return (
                        <button
                          key={s.branch.id}
                          onClick={() => navigate(`/admin/branches/${s.branch.id}`)}
                          className="w-full grid grid-cols-[1fr_auto] lg:grid-cols-[1.2fr_repeat(4,minmax(100px,auto))_24px] items-center gap-3 py-3.5 text-left bg-white hover:bg-brand-50/70 dark:bg-slate-900/40 dark:hover:bg-brand-950/30 px-5 pl-12 transition-colors"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-slate-800 dark:text-slate-100">{s.branch.name}</p>
                              {branchNewCount > 0 && (
                                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                  {branchNewCount}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-300">Branch details</p>
                          </div>
                          <span className="hidden lg:block text-sm text-slate-600 dark:text-slate-300">{s.outagesThisMonth} outage(s)</span>
                          <span className="hidden lg:block text-sm text-slate-600 dark:text-slate-300">{formatMinutes(s.hoursThisMonth * 60)}</span>
                          <span className="hidden lg:block text-sm text-slate-600 dark:text-slate-300">{s.fuelLitresThisMonth.toFixed(1)} L</span>
                          <span className="hidden lg:block text-sm text-slate-600 dark:text-slate-300">{formatUGX(s.fuelCostThisMonth)}</span>
                          <div className="flex items-center justify-end gap-2">
                            {s.serviceDueSoon && <Badge tone="amber">Service due</Badge>}
                            <ChevronRight size={18} className="text-slate-400 dark:text-slate-300" />
                          </div>
                        </button>
                          )
                        })()
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {!grouped.length && <p className="text-sm text-slate-400 py-6 text-center">No branches match your search.</p>}
          </div>
        )}
      </div>

      <aside className="card xl:sticky xl:top-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-gold-300">
                <Bell size={18} />
                {newEntries.length > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {newEntries.length}
                  </span>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">Live Entries</h3>
                <p className="text-xs text-slate-500 dark:text-slate-300">Latest branch activity</p>
              </div>
            </div>
          </div>
          {newEntries.length > 0 && (
            <button
              type="button"
              onClick={markSeen}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/30"
            >
              Mark seen
            </button>
          )}
        </div>

        {feedError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-300">{feedError}</p>}
        {feedLoading ? (
          <p className="text-sm text-slate-400">Loading entries...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-400">No branch entries yet.</p>
        ) : (
          <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
            {entries.map((entry) => {
              const description = describeAdminEntry(entry)
              const isNew = !isEntrySeen(entry)
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    markEntrySeen(entry)
                    if (entry.branch_id) navigate(`/admin/branches/${entry.branch_id}`)
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50/80 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-brand-800 dark:hover:bg-brand-950/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{description.title}</p>
                        {isNew && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-300">{entry.branches?.name ?? 'Unknown branch'}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{description.detail}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">{formatDateTime(entry.created_at)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </aside>
      </div>
    </div>
  )
}
