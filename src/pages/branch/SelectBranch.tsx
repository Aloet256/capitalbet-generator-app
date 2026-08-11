import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Building2, Clock, ShieldCheck, Ban, Search, LockKeyhole, RefreshCw } from 'lucide-react'
import { useBranches } from '../../hooks/useBranches'
import { useBranchDevice } from '../../context/BranchDeviceContext'
import { Spinner } from '../../components/ui/Spinner'
import { ThemeToggle } from '../../components/ui/ThemeToggle'
import { BrandLogo } from '../../components/BrandLogo'

export default function SelectBranch() {
  const { grouped, loading: branchesLoading, error: branchesError } = useBranches()
  const { branch, deviceStatus, loading, selectBranch, refreshStatus } = useBranchDevice()
  const [query, setQuery] = useState('')
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [selectionError, setSelectionError] = useState<string | null>(null)

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return grouped
    const q = query.toLowerCase()
    const out: typeof grouped = {}
    for (const [region, list] of Object.entries(grouped)) {
      const matched = list.filter((b) => b.name.toLowerCase().includes(q))
      if (matched.length) out[region] = matched
    }
    return out
  }, [grouped, query])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={32} />
      </div>
    )
  }

  if (branch) {
    if (deviceStatus === 'approved') {
      return <Navigate to="/branch/dashboard" replace />
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center">
          {deviceStatus === 'pending' && (
            <>
              <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4">
                <Clock size={26} />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Waiting for admin approval</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                This computer is permanently assigned to <span className="font-semibold">{branch.name}</span>. An admin
                must approve it before operational data can be opened. Status is checked automatically every 20 seconds.
              </p>
            </>
          )}

          {deviceStatus === 'revoked' && (
            <>
              <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4">
                <Ban size={26} />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Device access revoked</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                This computer remains assigned to <span className="font-semibold">{branch.name}</span> and cannot select
                another branch. Contact an administrator if the branch needs a replacement device.
              </p>
            </>
          )}

          {deviceStatus === null && (
            <>
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center mx-auto mb-4">
                <Building2 size={26} />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Assignment needs to be retried</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                This browser is locked to <span className="font-semibold">{branch.name}</span>, but the server request was
                not found. Retry the same branch assignment below.
              </p>
              <button
                onClick={async () => {
                  setSelectionError(null)
                  const res = await selectBranch(branch.id)
                  if (res.error) setSelectionError(res.error)
                }}
                className="btn-primary w-full mt-5"
              >
                <RefreshCw size={16} /> Retry assignment
              </button>
            </>
          )}

          {selectionError && <p className="text-sm text-red-500 mt-3">{selectionError}</p>}
          <button onClick={() => void refreshStatus()} className="btn-secondary w-full mt-3">
            <RefreshCw size={16} /> Check approval now
          </button>
        </div>
      </div>
    )
  }

  const handleSelect = async (id: string) => {
    setSubmitting(id)
    setSelectionError(null)
    const res = await selectBranch(id)
    if (res.error) setSelectionError(res.error)
    setSubmitting(null)
  }

  return (
    <div className="min-h-screen p-4 lg:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div>
              <BrandLogo size="lg" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Select this computer's permanent branch</p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        <div className="card mb-6 flex items-start gap-3 bg-brand-50 dark:bg-brand-900/20 border-brand-200 dark:border-brand-900">
          <ShieldCheck className="text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" size={20} />
          <p className="text-sm text-brand-800 dark:text-brand-300">
            A computer can be assigned to only one branch. Once selected, it cannot switch to another branch. Branches
            already assigned to a pending or approved computer are locked from selection.
          </p>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search branch by name..."
            className="input pl-10"
          />
        </div>

        {(selectionError || branchesError) && (
          <div className="mb-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
            {selectionError || branchesError}
          </div>
        )}

        {branchesLoading ? (
          <div className="flex justify-center py-16">
            <Spinner size={28} />
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(filteredGroups).map(([region, list]) => (
              <div key={region}>
                <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">{region}</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {list.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => void handleSelect(b.id)}
                      disabled={submitting !== null || b.device_locked}
                      className="card text-left hover:border-brand-400 dark:hover:border-brand-600 hover:shadow-md transition-all flex items-center justify-between disabled:opacity-55 disabled:cursor-not-allowed"
                    >
                      <div>
                        <span className="font-medium text-slate-800 dark:text-slate-100">{b.name}</span>
                        {b.device_locked && <p className="text-xs text-slate-400 mt-1">Assigned to another computer</p>}
                      </div>
                      {submitting === b.id ? (
                        <Spinner size={16} />
                      ) : b.device_locked ? (
                        <LockKeyhole size={16} className="text-amber-500" />
                      ) : (
                        <Building2 size={16} className="text-slate-300" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {Object.keys(filteredGroups).length === 0 && (
              <p className="text-center text-slate-400 py-10">No branches match “{query}”.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
