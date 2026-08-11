import { useEffect, useState } from 'react'
import { PowerOff, Power, Fuel, Plus } from 'lucide-react'
import { useBranchDevice } from '../../context/BranchDeviceContext'
import { usePowerSessions } from '../../hooks/usePowerSessions'
import { useFuelRefills } from '../../hooks/useFuelRefills'
import { Table } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { CurrencyInput } from '../../components/ui/CurrencyInput'
import { Textarea } from '../../components/ui/Textarea'
import { Button } from '../../components/ui/Button'
import { DeleteEntryButton } from '../../components/ui/DeleteEntryButton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDateTime, formatMinutes, formatUGX, formatDate, toLocalDateInput, parseCurrencyInput } from '../../lib/utils'
import type { PowerSession } from '../../types/database'

function LiveTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])
  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60
  return (
    <span className="font-mono text-3xl font-bold tabular-nums">
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  )
}

export default function PowerMonitoring() {
  const { branch } = useBranchDevice()
  const branchId = branch?.id ?? null
  const { sessions, ongoing, loading, startOutage, stopOutage, deleteSession } = usePowerSessions(branchId)
  const { refills, addRefill, deleteRefill } = useFuelRefills(branchId)

  const [outageNotes, setOutageNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fuelModal, setFuelModal] = useState(false)
  const [fuelForm, setFuelForm] = useState({ refill_date: toLocalDateInput(), cost: '', litres: '', authorized_by: '' })
  const [fuelError, setFuelError] = useState<string | null>(null)

  const todayKey = toLocalDateInput()
  const todaysSessions = sessions.filter((session) => session.session_date === todayKey)
  const otherSessions = sessions.filter((session) => session.session_date !== todayKey)

  const handleStart = async () => {
    setBusy(true)
    setError(null)
    const res = await startOutage(outageNotes)
    if (res.error) setError(res.error)
    else setOutageNotes('')
    setBusy(false)
  }

  const handleStop = async () => {
    setBusy(true)
    setError(null)
    const res = await stopOutage()
    if (res.error) setError(res.error)
    setBusy(false)
  }

  const submitFuel = async () => {
    setFuelError(null)
    const res = await addRefill({
      refill_date: fuelForm.refill_date,
      cost: parseCurrencyInput(fuelForm.cost),
      litres: Number(fuelForm.litres),
      authorized_by: fuelForm.authorized_by,
      remarks: null,
    })
    if (res.error) {
      setFuelError(res.error)
      return
    }
    setFuelModal(false)
    setFuelForm({ refill_date: toLocalDateInput(), cost: '', litres: '', authorized_by: '' })
  }

  const renderOutageTable = (rows: PowerSession[], emptyTitle: string) => {
    if (rows.length === 0) return <EmptyState title={emptyTitle} />

    return (
      <Table headers={['Date', 'Start', 'End', 'Duration', 'Notes', '']}>
        {rows.map((s) => (
          <tr key={s.id}>
            <td className="py-2.5 pr-4 whitespace-nowrap">{formatDate(s.session_date)}</td>
            <td className="py-2.5 pr-4 whitespace-nowrap">{formatDateTime(s.started_at)}</td>
            <td className="py-2.5 pr-4 whitespace-nowrap">
              {s.ended_at ? formatDateTime(s.ended_at) : <Badge tone="red">Ongoing</Badge>}
            </td>
            <td className="py-2.5 pr-4 whitespace-nowrap">{formatMinutes(s.duration_minutes)}</td>
            <td className="py-2.5 pr-4 max-w-xs truncate">{s.notes ?? '-'}</td>
            <td className="py-2.5 pr-4 whitespace-nowrap text-right">
              <DeleteEntryButton label="outage entry" onDelete={(password) => deleteSession(s.id, password)} />
            </td>
          </tr>
        ))}
      </Table>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Generator & Power Monitoring</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Track outages, generator runtime and fuel refills.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="card py-8">
            <div className="flex flex-col items-center text-center">
              {ongoing ? (
                <>
                  <p className="text-sm font-medium text-red-500 mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Power is OFF - generator running
                  </p>
                  <LiveTimer startedAt={ongoing.started_at} />
                  <p className="text-xs text-slate-400 mt-2">Started {formatDateTime(ongoing.started_at)}</p>
                  {ongoing.notes && <p className="text-sm text-slate-500 mt-1">"{ongoing.notes}"</p>}
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-emerald-600 mb-4 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Power is ON
                  </p>
                  <div className="w-full max-w-md">
                    <Textarea
                      placeholder="Optional notes about this outage..."
                      value={outageNotes}
                      onChange={(e) => setOutageNotes(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="mt-5 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
                <Button
                  variant="danger"
                  className="h-20 px-6 text-base sm:text-lg font-bold"
                  onClick={handleStart}
                  disabled={busy || Boolean(ongoing) || !branchId}
                >
                  <PowerOff size={24} /> POWER IS OFF
                </Button>
                <Button
                  className="h-20 px-6 text-base sm:text-lg font-bold !bg-emerald-600 hover:!bg-emerald-700 !shadow-emerald-900/10"
                  onClick={handleStop}
                  disabled={busy || !ongoing}
                >
                  <Power size={24} /> POWER IS BACK
                </Button>
              </div>

              {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">Outage History</h3>
            {loading ? (
              <p className="text-sm text-slate-400">Loading...</p>
            ) : (
              <div className="space-y-6">
                <section>
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Today</h4>
                  {renderOutageTable(todaysSessions, 'No outages recorded today')}
                </section>
                <section>
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">ALL OTHER</h4>
                  {renderOutageTable(otherSessions, 'No older outages recorded')}
                </section>
              </div>
            )}
          </div>
        </div>

        <div className="card self-start">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Fuel size={18} className="text-amber-500" />
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">Fuel Refills</h3>
            </div>
            <Button onClick={() => setFuelModal(true)}>
              <Plus size={16} /> Add Refill
            </Button>
          </div>
          {refills.length === 0 ? (
            <EmptyState title="No fuel refills recorded yet" />
          ) : (
            <Table headers={['Date', 'Litres', 'Cost', 'Authorized By', '']}>
              {refills.map((r) => (
                <tr key={r.id}>
                  <td className="py-2.5 pr-4 whitespace-nowrap">{formatDate(r.refill_date)}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">{r.litres} L</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">{formatUGX(r.cost)}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">{r.authorized_by}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-right">
                    <DeleteEntryButton label="fuel refill" onDelete={(password) => deleteRefill(r.id, password)} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </div>

      <Modal open={fuelModal} onClose={() => setFuelModal(false)} title="Add Fuel Refill">
        <div className="space-y-4">
          <Input label="Date" type="date" value={fuelForm.refill_date} onChange={(e) => setFuelForm({ ...fuelForm, refill_date: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Litres" type="number" min="0" step="0.1" value={fuelForm.litres} onChange={(e) => setFuelForm({ ...fuelForm, litres: e.target.value })} />
            <CurrencyInput label="Cost (UGX)" min="0" value={fuelForm.cost} onValueChange={(cost) => setFuelForm({ ...fuelForm, cost })} />
          </div>
          <Input label="Authorized By" value={fuelForm.authorized_by} onChange={(e) => setFuelForm({ ...fuelForm, authorized_by: e.target.value })} />
          {fuelError && <p className="text-sm text-red-500">{fuelError}</p>}
          <Button className="w-full" onClick={submitFuel}>Save Refill</Button>
        </div>
      </Modal>
    </div>
  )
}
