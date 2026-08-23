import { useEffect, useMemo, useState } from 'react'
import { Lightbulb, Plus, Tv } from 'lucide-react'
import { useBranchDevice } from '../../context/BranchDeviceContext'
import { useAppSettings } from '../../hooks/useAppSettings'
import { useBranchUtilitySettings } from '../../hooks/useBranchUtilitySettings'
import { useDstv } from '../../hooks/useDstv'
import { useYaka } from '../../hooks/useYaka'
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
import { DSTV_PACKAGES } from '../../lib/dstv'
import { cn, daysUntil, formatDate, formatUGX, parseCurrencyInput, toLocalDateInput } from '../../lib/utils'
import type { DstvPackage } from '../../types/database'

export default function Utilities() {
  const { branch } = useBranchDevice()
  const branchId = branch?.id ?? null
  const [tab, setTab] = useState<'dstv' | 'yaka'>('dstv')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Utilities</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">DSTV subscriptions and Yaka electricity purchases.</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => setTab('dstv')} className={cn('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2', tab === 'dstv' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500')}>
          <Tv size={16} /> DSTV
        </button>
        <button onClick={() => setTab('yaka')} className={cn('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2', tab === 'yaka' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500')}>
          <Lightbulb size={16} /> Yaka
        </button>
      </div>

      {tab === 'dstv' ? <DstvTab branchId={branchId} /> : <YakaTab branchId={branchId} />}
    </div>
  )
}

function DstvTab({ branchId }: { branchId: string | null }) {
  const { settings: appSettings } = useAppSettings()
  const { settings: utilitySettings, error: utilityError, saveSettings: saveUtilitySettings } = useBranchUtilitySettings(branchId)
  const { subscriptions, addSubscription, deleteSubscription } = useDstv(branchId)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    subscription_date: toLocalDateInput(),
    smart_card_number: '',
    package: 'Compact' as DstvPackage,
    amountMode: 'package' as 'package' | 'custom',
    amount: '',
    remarks: '',
  })

  const smartCardOnFile = utilitySettings?.dstv_smart_card_number?.trim() ?? ''
  const packagePrice = appSettings.dstv_package_prices[form.package] ?? 0
  const payableAmount = form.amountMode === 'custom' ? parseCurrencyInput(form.amount) : packagePrice

  useEffect(() => {
    if (form.amountMode === 'package') setForm((current) => ({ ...current, amount: String(packagePrice) }))
  }, [form.amountMode, packagePrice])

  const submit = async () => {
    setError(null)

    const smartCardNumber = smartCardOnFile || form.smart_card_number.trim()
    if (!smartCardNumber) {
      setError('Smart card number is required the first time for this branch.')
      return
    }

    if (!smartCardOnFile) {
      const saved = await saveUtilitySettings({ dstv_smart_card_number: smartCardNumber })
      if (saved.error) {
        setError(saved.error)
        return
      }
    }

    const res = await addSubscription({
      subscription_date: form.subscription_date,
      smart_card_number: smartCardNumber,
      package: form.package,
      amount: payableAmount,
      remarks: form.remarks || null,
    })
    if (res.error) {
      setError(res.error)
      return
    }
    setOpen(false)
    setForm({
      subscription_date: toLocalDateInput(),
      smart_card_number: '',
      package: form.package,
      amountMode: 'package',
      amount: String(packagePrice),
      remarks: '',
    })
  }

  return (
    <div className="card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-3">
        <div>
          <p className="text-sm text-slate-500">Reminder is sent before renewal based on the admin setting.</p>
          <p className="text-xs text-slate-400 mt-1">Smart card on file: {smartCardOnFile || 'Not set yet'}</p>
          {utilityError && <p className="text-xs text-red-500 mt-1">{utilityError}</p>}
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} /> Add Subscription
        </Button>
      </div>
      {subscriptions.length === 0 ? (
        <EmptyState title="No DSTV records yet" />
      ) : (
        <Table headers={['Subscribed', 'Smart Card', 'Package', 'Amount', 'Renewal', 'Status', 'Remarks', '']}>
          {subscriptions.map((s) => {
            const days = daysUntil(s.renewal_date)
            return (
              <tr key={s.id}>
                <td className="py-2.5 pr-4 whitespace-nowrap">{formatDate(s.subscription_date)}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap">{s.smart_card_number}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap"><Badge tone="brand">{s.package}</Badge></td>
                <td className="py-2.5 pr-4 whitespace-nowrap">{formatUGX(s.amount)}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap">{formatDate(s.renewal_date)}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap">
                  {days < 0 ? <Badge tone="red">Overdue</Badge> : days <= 5 ? <Badge tone="amber">Due soon</Badge> : <Badge tone="green">Active</Badge>}
                </td>
                <td className="py-2.5 pr-4 max-w-xs truncate">{s.remarks ?? '-'}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-right">
                  <DeleteEntryButton label="DSTV subscription" onDelete={(password) => deleteSubscription(s.id, password)} />
                </td>
              </tr>
            )
          })}
        </Table>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add DSTV Subscription" wide>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Subscription Date" type="date" value={form.subscription_date} onChange={(e) => setForm({ ...form, subscription_date: e.target.value })} />
            <Select
              label="Package"
              value={form.package}
              onChange={(e) => setForm({ ...form, package: e.target.value as DstvPackage })}
              options={DSTV_PACKAGES.map((p) => ({ value: p, label: `${p} - ${formatUGX(appSettings.dstv_package_prices[p])}` }))}
            />
          </div>

          {smartCardOnFile ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-950/40">
              <p className="text-slate-400">Smart card number</p>
              <p className="font-semibold text-slate-800 dark:text-slate-100">{smartCardOnFile}</p>
            </div>
          ) : (
            <Input label="Smart Card Number" value={form.smart_card_number} onChange={(e) => setForm({ ...form, smart_card_number: e.target.value })} />
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <Select
              label="Amount"
              value={form.amountMode}
              onChange={(e) => setForm({ ...form, amountMode: e.target.value as 'package' | 'custom' })}
              options={[
                { value: 'package', label: `Use package price (${formatUGX(packagePrice)})` },
                { value: 'custom', label: 'Other amount' },
              ]}
            />
            {form.amountMode === 'custom' ? (
              <CurrencyInput label="Custom Amount (UGX)" min="0" value={form.amount} onValueChange={(amount) => setForm({ ...form, amount })} />
            ) : (
              <Input label="Amount (UGX)" value={formatUGX(packagePrice)} readOnly />
            )}
          </div>
          <Textarea label="Remarks (optional)" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button className="w-full" onClick={submit}>Save Subscription</Button>
        </div>
      </Modal>
    </div>
  )
}

function YakaTab({ branchId }: { branchId: string | null }) {
  const { settings: utilitySettings, error: utilityError, saveSettings: saveUtilitySettings } = useBranchUtilitySettings(branchId)
  const { purchases, addPurchase, deletePurchase } = useYaka(branchId)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    purchase_date: toLocalDateInput(),
    meter_number: '',
    units: '',
    amount: '',
    remarks: '',
  })

  const meterOnFile = useMemo(() => utilitySettings?.yaka_meter_number?.trim() ?? '', [utilitySettings])

  const submit = async () => {
    setError(null)

    const meterNumber = meterOnFile || form.meter_number.trim()
    if (!meterNumber) {
      setError('Meter number is required the first time for this branch.')
      return
    }

    if (!meterOnFile) {
      const saved = await saveUtilitySettings({ yaka_meter_number: meterNumber })
      if (saved.error) {
        setError(saved.error)
        return
      }
    }

    const res = await addPurchase({
      purchase_date: form.purchase_date,
      meter_number: meterNumber,
      units: Number(form.units),
      amount: parseCurrencyInput(form.amount),
      remarks: form.remarks || null,
    })
    if (res.error) {
      setError(res.error)
      return
    }
    setOpen(false)
    setForm({ purchase_date: toLocalDateInput(), meter_number: '', units: '', amount: '', remarks: '' })
  }

  return (
    <div className="card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-3">
        <div>
          <p className="text-sm text-slate-500">Yaka is treated as a monthly load. The system reminds the branch before the next expected reload date.</p>
          <p className="text-xs text-slate-400 mt-1">Meter number on file: {meterOnFile || 'Not set yet'}</p>
          {utilityError && <p className="text-xs text-red-500 mt-1">{utilityError}</p>}
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} /> Add Purchase
        </Button>
      </div>
      {purchases.length === 0 ? (
        <EmptyState title="No Yaka purchases yet" />
      ) : (
        <Table headers={['Date', 'Meter Number', 'Units', 'Amount', 'Next Reload', 'Status', 'Remarks', '']}>
          {purchases.map((p) => {
            const reloadDays = daysUntil(p.expected_reload_date)
            return (
              <tr key={p.id}>
                <td className="py-2.5 pr-4 whitespace-nowrap">{formatDate(p.purchase_date)}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap">{p.meter_number}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap">{p.units} kWh</td>
                <td className="py-2.5 pr-4 whitespace-nowrap">{formatUGX(p.amount)}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap">{formatDate(p.expected_reload_date)}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap">
                  {reloadDays < 0 ? <Badge tone="red">Reload overdue</Badge> : reloadDays <= 3 ? <Badge tone="amber">Reload soon</Badge> : <Badge tone="green">Covered</Badge>}
                </td>
                <td className="py-2.5 pr-4 max-w-xs truncate">{p.remarks ?? '-'}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-right">
                  <DeleteEntryButton label="Yaka purchase" onDelete={(password) => deletePurchase(p.id, password)} />
                </td>
              </tr>
            )
          })}
        </Table>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add Yaka Purchase" wide>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Purchase Date" type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
            {meterOnFile ? (
              <Input label="Meter Number" value={meterOnFile} readOnly />
            ) : (
              <Input label="Meter Number" value={form.meter_number} onChange={(e) => setForm({ ...form, meter_number: e.target.value })} />
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Units (kWh)" type="number" min="0" step="0.1" value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} />
            <CurrencyInput label="Amount (UGX)" min="0" value={form.amount} onValueChange={(amount) => setForm({ ...form, amount })} />
          </div>
          <Textarea label="Remarks (optional)" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button className="w-full" onClick={submit}>Save Purchase</Button>
        </div>
      </Modal>
    </div>
  )
}
