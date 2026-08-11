import { useState } from 'react'
import { Check, RotateCcw, Smartphone, X } from 'lucide-react'
import { useDeviceRequests } from '../../hooks/useDeviceRequests'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Table } from '../../components/ui/Table'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDateTime } from '../../lib/utils'
import type { Device } from '../../types/database'

const TONE: Record<string, 'amber' | 'green' | 'red'> = { pending: 'amber', approved: 'green', revoked: 'red' }

export default function DeviceRequests() {
  const { devices, loading, error: loadError, approve, revoke, restore } = useDeviceRequests()
  const { admin } = useAdminAuth()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'revoked'>('all')

  const filtered = devices.filter((d) => filter === 'all' || d.status === filter)

  const run = async (device: Device, action: 'approve' | 'revoke' | 'restore') => {
    if (!admin) return
    setActionError(null)
    setBusyId(device.id)
    const result = action === 'approve' ? await approve(device, admin.id) : action === 'restore' ? await restore(device, admin.id) : await revoke(device, admin.id)
    if (result.error) setActionError(result.error)
    setBusyId(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Device Requests</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          One computer can belong to only one branch, and one branch can have only one pending/approved computer. Revoking a device frees that branch for a replacement computer; the revoked computer itself remains tied to its original branch.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {(['all', 'pending', 'approved', 'revoked'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium capitalize transition-colors whitespace-nowrap ${
              filter === f
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-900/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-brand-50 dark:hover:bg-brand-950/40'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {(loadError || actionError) && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {actionError || loadError}
        </div>
      )}

      <div className="card">
        {loading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Smartphone size={32} />} title="No device requests here" />
        ) : (
          <Table headers={['Branch', 'Device', 'Requested', 'Last Seen', 'Status', 'Actions']}>
            {filtered.map((d) => (
              <tr key={d.id}>
                <td className="py-2.5 pr-4 whitespace-nowrap font-medium text-slate-800 dark:text-slate-100">{d.branches?.name ?? '—'}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-slate-500">{d.device_label ?? 'Unknown device'}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-slate-500">{formatDateTime(d.requested_at)}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-slate-500">{formatDateTime(d.last_seen_at)}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap"><Badge tone={TONE[d.status]}>{d.status}</Badge></td>
                <td className="py-2.5 pr-4 whitespace-nowrap">
                  <div className="flex gap-2">
                    {d.status === 'pending' && (
                      <Button className="!px-3 !py-1.5 text-xs" onClick={() => void run(d, 'approve')} disabled={busyId === d.id}>
                        <Check size={14} /> Approve
                      </Button>
                    )}
                    {d.status === 'revoked' && (
                      <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={() => void run(d, 'restore')} disabled={busyId === d.id}>
                        <RotateCcw size={14} /> Restore
                      </Button>
                    )}
                    {d.status !== 'revoked' && (
                      <Button
                        variant="danger"
                        className="!px-3 !py-1.5 text-xs"
                        onClick={() => {
                          if (confirm('Revoke this computer? The branch will become available for a replacement computer.')) void run(d, 'revoke')
                        }}
                        disabled={busyId === d.id}
                      >
                        <X size={14} /> Revoke
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  )
}
