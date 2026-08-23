import { useState } from 'react'
import { CheckCircle2, Plus, Wrench, Hammer } from 'lucide-react'
import { useBranchDevice } from '../../context/BranchDeviceContext'
import { useServices } from '../../hooks/useServices'
import { useServiceDefaults } from '../../hooks/useServiceDefaults'
import { useRepairs, REPAIR_CATEGORIES } from '../../hooks/useRepairs'
import { Table } from '../../components/ui/Table'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { CurrencyInput } from '../../components/ui/CurrencyInput'
import { Textarea } from '../../components/ui/Textarea'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { DeleteEntryButton } from '../../components/ui/DeleteEntryButton'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { cn, formatDate, formatUGX, daysUntil, toLocalDateInput, parseCurrencyInput } from '../../lib/utils'

export default function Servicing() {
  const { branch } = useBranchDevice()
  const branchId = branch?.id ?? null
  const [tab, setTab] = useState<'service' | 'repair'>('service')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Servicing & Repairs</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Log generator servicing and repair history.</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setTab('service')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
            tab === 'service' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500'
          )}
        >
          <Wrench size={16} /> Servicing
        </button>
        <button
          onClick={() => setTab('repair')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
            tab === 'repair' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500'
          )}
        >
          <Hammer size={16} /> Repairs
        </button>
      </div>

      {tab === 'service' ? <ServicingTab branchId={branchId} /> : <RepairsTab branchId={branchId} />}
    </div>
  )
}

function ServicingTab({ branchId }: { branchId: string | null }) {
  const { services, addService, deleteService } = useServices(branchId)
  const { defaults, loading: defaultsLoading } = useServiceDefaults()
  const [servicedConfirmed, setServicedConfirmed] = useState(false)
  const [repairPerformed, setRepairPerformed] = useState<boolean | null>(null)
  const [serviceDetails, setServiceDetails] = useState('')
  const [serviceCost, setServiceCost] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const settingText = (value: string, fallback: string) => {
    const trimmed = value.trim()
    return trimmed || fallback
  }

  const confirmServiced = () => {
    setError(null)
    setSuccess(null)
    setServicedConfirmed(true)
  }

  const submitService = async () => {
    setError(null)
    setSuccess(null)

    if (!servicedConfirmed) {
      setError('First click the green serviced button to confirm the generator has been serviced.')
      return
    }

    if (repairPerformed === null) {
      setError('Select whether any repairs were performed during servicing.')
      return
    }

    if (repairPerformed && !serviceDetails.trim()) {
      setError('Repair details are required when repairs were performed.')
      return
    }

    setSaving(true)

    const res = await addService({
      technician_name: settingText(defaults.generator_service_technician_name, 'Mr Kawesi'),
      technician_phone: settingText(defaults.generator_service_technician_phone, 'N/A'),
      company: defaults.generator_service_company.trim() || null,
      cost: repairPerformed && serviceCost ? parseCurrencyInput(serviceCost) : null,
      items_replaced: null,
      repairs_done: repairPerformed ? serviceDetails.trim() : 'No repairs performed',
      work_done: settingText(defaults.generator_service_work_done, 'Servicing Generator'),
      remarks: settingText(defaults.generator_service_remarks, 'Servicing Generator'),
    })

    setSaving(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setServicedConfirmed(false)
    setRepairPerformed(null)
    setServiceDetails('')
    setServiceCost('')
    setSuccess(`Generator service recorded for ${formatDate(toLocalDateInput())}.`)
  }

  return (
    <div className="card">
      <div className="flex flex-col items-center gap-3 text-center mb-3">
        <div>
          <p className="text-sm text-slate-500">Next service is automatically calculated as 25 days after each service date.</p>
          <p className="text-xs text-slate-400 mt-1">
            Technician: {settingText(defaults.generator_service_technician_name, 'Mr Kawesi')} / Work: {settingText(defaults.generator_service_work_done, 'Servicing Generator')}
          </p>
        </div>
        <Button
          type="button"
          className="relative w-full max-w-2xl min-h-16 px-12 py-4 text-base sm:text-lg font-bold !bg-emerald-600 hover:!bg-emerald-700 !shadow-emerald-900/10"
          onClick={confirmServiced}
          disabled={saving || defaultsLoading || !branchId}
        >
          <span className="mx-auto">CLICK HERE IF GENERATOR HAS BEEN SERVICED</span>
          {servicedConfirmed && <CheckCircle2 className="absolute right-5" size={24} />}
        </Button>
        <div className="w-full max-w-2xl space-y-3 text-left">
          <div>
            <p className="label">Were repairs performed?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRepairPerformed(true)}
                className={cn(
                  'rounded-xl border px-4 py-3 text-sm font-semibold transition',
                  repairPerformed === true
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'border-slate-200 text-slate-600 hover:border-brand-300 dark:border-slate-800 dark:text-slate-300'
                )}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => {
                  setRepairPerformed(false)
                  setServiceDetails('')
                  setServiceCost('')
                }}
                className={cn(
                  'rounded-xl border px-4 py-3 text-sm font-semibold transition',
                  repairPerformed === false
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300'
                    : 'border-slate-200 text-slate-600 hover:border-brand-300 dark:border-slate-800 dark:text-slate-300'
                )}
              >
                No
              </button>
            </div>
          </div>

          {repairPerformed && (
            <div className="grid gap-3">
              <Textarea
                label="Repair Details"
                value={serviceDetails}
                onChange={(event) => setServiceDetails(event.target.value)}
              />
              <CurrencyInput
                label="Cost Involved (UGX)"
                min="0"
                value={serviceCost}
                onValueChange={setServiceCost}
              />
            </div>
          )}
        </div>
        <Button
          type="button"
          className="w-full max-w-sm min-h-12 px-8 text-base font-bold"
          onClick={submitService}
          disabled={saving || defaultsLoading || !branchId || !servicedConfirmed}
        >
          {saving ? 'SUBMITTING...' : 'SUBMIT'}
        </Button>
      </div>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {success && <p className="text-sm text-emerald-600 mb-3">{success}</p>}
      {services.length === 0 ? (
        <EmptyState title="No servicing records yet" />
      ) : (
          <Table headers={['Service Date', 'Technician', 'Company', 'Repair Details', 'Cost Involved', 'Next Due', 'Status', 'Work Done', '']}>
          {services.map((s) => {
            const days = daysUntil(s.next_service_date)
            return (
              <tr key={s.id}>
                <td className="py-2.5 pr-4 whitespace-nowrap">{formatDate(s.service_date)}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap">{s.technician_name}<br /><span className="text-xs text-slate-400">{s.technician_phone}</span></td>
                <td className="py-2.5 pr-4 whitespace-nowrap">{s.company ?? '—'}</td>
                <td className="py-2.5 pr-4 max-w-xs truncate">{s.repairs_done || '-'}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap">{formatUGX(s.cost)}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap">{formatDate(s.next_service_date)}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap">
                  {days < 0 ? <Badge tone="red">Overdue</Badge> : days <= 5 ? <Badge tone="amber">Due soon</Badge> : <Badge tone="green">Scheduled</Badge>}
                </td>
                <td className="py-2.5 pr-4 max-w-xs truncate">{s.work_done}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-right">
                  <DeleteEntryButton label="service record" onDelete={(password) => deleteService(s.id, password)} />
                </td>
              </tr>
            )
          })}
        </Table>
      )}
    </div>
  )
}

function RepairsTab({ branchId }: { branchId: string | null }) {
  const { repairs, addRepair, deleteRepair } = useRepairs(branchId)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    repair_date: toLocalDateInput(),
    category: 'Generator',
    description: '',
    cost: '',
  })

  const submit = async () => {
    setError(null)
    const cost = parseCurrencyInput(form.cost)
    if (cost <= 0) {
      setError('Repair cost is required.')
      return
    }
    const res = await addRepair({
      repair_date: form.repair_date,
      category: form.category as any,
      description: form.description,
      cost,
    })
    if (res.error) {
      setError(res.error)
      return
    }
    setOpen(false)
    setForm({ repair_date: toLocalDateInput(), category: 'Generator', description: '', cost: '' })
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500">Repairs are logged as history only — no reminders are generated.</p>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} /> Log Repair
        </Button>
      </div>
      {repairs.length === 0 ? (
        <EmptyState title="No repairs recorded yet" />
      ) : (
        <Table headers={['Date', 'Category', 'Description', 'Repair Cost', '']}>
          {repairs.map((r) => (
            <tr key={r.id}>
              <td className="py-2.5 pr-4 whitespace-nowrap">{formatDate(r.repair_date)}</td>
              <td className="py-2.5 pr-4 whitespace-nowrap"><Badge>{r.category}</Badge></td>
              <td className="py-2.5 pr-4 max-w-xs truncate">{r.description}</td>
              <td className="py-2.5 pr-4 whitespace-nowrap">{r.cost ? formatUGX(r.cost) : '—'}</td>
              <td className="py-2.5 pr-4 whitespace-nowrap text-right">
                <DeleteEntryButton label="repair record" onDelete={(password) => deleteRepair(r.id, password)} />
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Log Repair" wide>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Repair Date" type="date" value={form.repair_date} onChange={(e) => setForm({ ...form, repair_date: e.target.value })} />
            <Select
              label="Category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              options={REPAIR_CATEGORIES.map((c) => ({ value: c, label: c }))}
            />
          </div>
          <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <CurrencyInput label="Repair Cost (UGX)" min="0" value={form.cost} onValueChange={(cost) => setForm({ ...form, cost })} />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button className="w-full" onClick={submit}>Save Repair Record</Button>
        </div>
      </Modal>
    </div>
  )
}
