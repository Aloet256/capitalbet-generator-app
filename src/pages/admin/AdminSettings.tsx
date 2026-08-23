import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, EyeOff, KeyRound, Lightbulb, Pencil, RotateCcw, Send, ShieldCheck, SlidersHorizontal, Trash2, Tv, Wrench } from 'lucide-react'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { useAppSettings } from '../../hooks/useAppSettings'
import { Input } from '../../components/ui/Input'
import { CurrencyInput } from '../../components/ui/CurrencyInput'
import { Textarea } from '../../components/ui/Textarea'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { runReminderSweepNow } from '../../lib/telegram'
import { getTelegramRegionStatuses, resetTelegramRegionConfig, saveTelegramRegionConfig } from '../../lib/telegramConfig'
import { resetSystemData } from '../../lib/systemReset'
import { supabase } from '../../lib/supabase'
import { DSTV_PACKAGES } from '../../lib/dstv'
import { parseCurrencyInput, toLocalDateInput } from '../../lib/utils'
import type { AppSettings, TelegramRegionSecretStatus } from '../../types/database'

type TelegramModalMode = 'edit' | 'reset'

type BranchUtilityFormRow = {
  branch_id: string
  name: string
  region: string
  dstv_smart_card_number: string
  yaka_meter_number: string
}

export default function AdminSettings() {
  const { admin, changePassword } = useAdminAuth()
  const { settings, loading: settingsLoading, error: settingsError, updateSetting, reload } = useAppSettings()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)

  const [form, setForm] = useState<AppSettings>(settings)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null)
  const [sweepMessage, setSweepMessage] = useState<string | null>(null)
  const [sweeping, setSweeping] = useState(false)
  const [testingReminders, setTestingReminders] = useState(false)
  const [reminderTestDate, setReminderTestDate] = useState(toLocalDateInput())
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [regions, setRegions] = useState<string[]>([])
  const [regionLoadError, setRegionLoadError] = useState<string | null>(null)
  const [branchesMissingRegion, setBranchesMissingRegion] = useState(0)
  const [branchUtilityRows, setBranchUtilityRows] = useState<BranchUtilityFormRow[]>([])
  const [openUtilityBranches, setOpenUtilityBranches] = useState<Set<string>>(() => new Set())
  const [branchUtilityError, setBranchUtilityError] = useState<string | null>(null)
  const [telegramStatuses, setTelegramStatuses] = useState<TelegramRegionSecretStatus[]>([])
  const [telegramStatusLoading, setTelegramStatusLoading] = useState(false)
  const [telegramStatusError, setTelegramStatusError] = useState<string | null>(null)
  const [telegramModal, setTelegramModal] = useState<{ mode: TelegramModalMode; region: string } | null>(null)
  const [telegramPassword, setTelegramPassword] = useState('')
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [telegramChatId, setTelegramChatId] = useState('')
  const [telegramSaving, setTelegramSaving] = useState(false)
  const [telegramActionError, setTelegramActionError] = useState<string | null>(null)
  const [telegramActionMessage, setTelegramActionMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!settingsLoading) setForm(settings)
  }, [settings, settingsLoading])

  const loadBranchUtilityRows = useCallback(async () => {
    const [{ data: branches, error: branchError }, { data: utilityRows, error: utilityError }] = await Promise.all([
      supabase
      .from('branches')
      .select('id, name, region')
      .eq('active', true)
      .order('region', { ascending: true })
      .order('name', { ascending: true }),
      supabase
        .from('branch_utility_settings')
        .select('branch_id, dstv_smart_card_number, yaka_meter_number'),
    ])

    if (branchError) {
      setRegionLoadError(branchError.message)
      return
    }

    if (utilityError) {
      setBranchUtilityError(utilityError.message)
    } else {
      setBranchUtilityError(null)
    }

    const utilityByBranch = new Map(
      ((utilityRows as { branch_id: string; dstv_smart_card_number: string | null; yaka_meter_number: string | null }[] | null) ?? [])
        .map((row) => [row.branch_id, row])
    )
    const uniqueRegions = new Set<string>()
    let missing = 0
    const nextUtilityRows: BranchUtilityFormRow[] = []

    for (const row of (branches as { id: string; name: string; region: string | null }[] | null) ?? []) {
      const region = typeof row.region === 'string' ? row.region.trim() : ''
      if (region) uniqueRegions.add(region)
      else missing += 1
      const utility = utilityByBranch.get(row.id)
      nextUtilityRows.push({
        branch_id: row.id,
        name: row.name,
        region: region || 'Unassigned Region',
        dstv_smart_card_number: utility?.dstv_smart_card_number ?? '',
        yaka_meter_number: utility?.yaka_meter_number ?? '',
      })
    }

    setRegions([...uniqueRegions].sort((a, b) => a.localeCompare(b)))
    setBranchesMissingRegion(missing)
    setRegionLoadError(null)
    setBranchUtilityRows(nextUtilityRows)
  }, [])

  const loadTelegramStatuses = useCallback(async () => {
    setTelegramStatusLoading(true)
    setTelegramStatusError(null)
    const res = await getTelegramRegionStatuses()
    setTelegramStatusLoading(false)

    if (res.error) {
      setTelegramStatusError(res.error)
      return
    }
    setTelegramStatuses(res.data)
  }, [])

  useEffect(() => {
    void loadBranchUtilityRows()
    void loadTelegramStatuses()
  }, [loadBranchUtilityRows, loadTelegramStatuses])

  const telegramStatusByRegion = useMemo(() => {
    const map = new Map<string, TelegramRegionSecretStatus>()
    for (const status of telegramStatuses) map.set(status.region, status)
    return map
  }, [telegramStatuses])

  const missingTelegramRegions = useMemo(
    () =>
      regions.filter((region) => {
        const status = telegramStatusByRegion.get(region)
        return !status?.bot_token_configured || !status?.chat_id_configured
      }),
    [regions, telegramStatusByRegion]
  )

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError(null)
    setPwSuccess(false)
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match.')
      return
    }
    const res = await changePassword(newPassword)
    if (res.error) {
      setPwError(res.error)
      return
    }
    setPwSuccess(true)
    setNewPassword('')
    setConfirmPassword('')
  }

  const saveSettings = async () => {
    setSavingSettings(true)
    setSettingsSaved(false)
    setSettingsSaveError(null)

    for (const [key, value] of Object.entries(form) as [keyof AppSettings, AppSettings[keyof AppSettings]][]) {
      const res = await updateSetting(key, value)
      if (res.error) {
        setSettingsSaveError(res.error)
        setSavingSettings(false)
        return
      }
    }

    if (branchUtilityRows.length > 0) {
      const { error } = await supabase.from('branch_utility_settings').upsert(
        branchUtilityRows.map((row) => ({
          branch_id: row.branch_id,
          dstv_smart_card_number: row.dstv_smart_card_number.trim() || null,
          yaka_meter_number: row.yaka_meter_number.trim() || null,
        })),
        { onConflict: 'branch_id' }
      )

      if (error) {
        setSettingsSaveError(error.message)
        setSavingSettings(false)
        return
      }
    }

    await reload()
    await loadBranchUtilityRows()
    setSavingSettings(false)
    setSettingsSaved(true)
  }

  const updateBranchUtilityRow = (branchId: string, field: 'dstv_smart_card_number' | 'yaka_meter_number', value: string) => {
    setBranchUtilityRows((rows) =>
      rows.map((row) => (row.branch_id === branchId ? { ...row, [field]: value } : row))
    )
  }

  const toggleUtilityBranch = (branchId: string) => {
    setOpenUtilityBranches((current) => {
      const next = new Set(current)
      if (next.has(branchId)) next.delete(branchId)
      else next.add(branchId)
      return next
    })
  }

  const testSweep = async () => {
    setSweeping(true)
    setSweepMessage(null)
    const res = await runReminderSweepNow()
    setSweepMessage(res.message)
    setSweeping(false)
  }

  const testReminderDate = async () => {
    if (!reminderTestDate) {
      setSweepMessage('Choose a test date first.')
      return
    }

    setTestingReminders(true)
    setSweepMessage(null)
    const res = await runReminderSweepNow({ dryRun: true, today: reminderTestDate })
    setSweepMessage(res.message)
    setTestingReminders(false)
  }

  const submitSystemReset = async () => {
    setResetting(true)
    setResetError(null)
    setResetSuccess(false)
    const res = await resetSystemData(resetPassword)
    setResetting(false)

    if (res.error) {
      setResetError(res.error)
      return
    }

    setResetPassword('')
    setResetModalOpen(false)
    setResetSuccess(true)
  }

  const closeTelegramModal = () => {
    if (telegramSaving) return
    setTelegramModal(null)
    setTelegramPassword('')
    setTelegramBotToken('')
    setTelegramChatId('')
    setTelegramActionError(null)
  }

  const openTelegramModal = (mode: TelegramModalMode, region: string) => {
    setTelegramModal({ mode, region })
    setTelegramPassword('')
    setTelegramBotToken('')
    setTelegramChatId('')
    setTelegramActionError(null)
    setTelegramActionMessage(null)
  }

  const submitTelegramConfig = async () => {
    if (!telegramModal) return
    setTelegramSaving(true)
    setTelegramActionError(null)
    setTelegramActionMessage(null)

    const res =
      telegramModal.mode === 'edit'
        ? await saveTelegramRegionConfig({
            region: telegramModal.region,
            botToken: telegramBotToken,
            chatId: telegramChatId,
            password: telegramPassword,
          })
        : await resetTelegramRegionConfig(telegramModal.region, telegramPassword)

    setTelegramSaving(false)
    if (res.error) {
      setTelegramActionError(res.error)
      return
    }

    const region = telegramModal.region
    setTelegramModal(null)
    setTelegramPassword('')
    setTelegramBotToken('')
    setTelegramChatId('')
    setTelegramActionMessage(
      telegramModal.mode === 'edit'
        ? `Telegram configuration saved for ${region}.`
        : `Telegram configuration reset for ${region}.`
    )
    await loadTelegramStatuses()
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Manage your password and system-wide reminder configuration.</p>
      </div>

      {admin?.must_change_password && (
        <div className="card bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900">
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
            Your account requires a password change. Set a new password before accessing the rest of the admin console.
          </p>
        </div>
      )}

      <form onSubmit={submitPassword} className="card">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound size={18} className="text-brand-600" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Change Password</h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="New Password" type="password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <Input label="Confirm Password" type="password" minLength={8} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        {pwError && <p className="text-sm text-red-500 mt-3">{pwError}</p>}
        {pwSuccess && <p className="text-sm text-emerald-600 mt-3">Password updated successfully.</p>}
        <Button type="submit" className="mt-4">Update Password</Button>
      </form>

      <div className="card">
        <div className="flex items-center gap-2 mb-2">
          <SlidersHorizontal size={18} className="text-brand-600" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Reminder & System Settings</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">Generator servicing is scheduled every 25 days. DSTV and Yaka are treated as monthly cycles; the values below control how many days before the due date reminders are sent.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Input
            label="Service Reminder (days before due)"
            type="number"
            min="1"
            max="24"
            value={form.service_reminder_days}
            onChange={(e) => setForm({ ...form, service_reminder_days: Number(e.target.value) })}
          />
          <Input
            label="DSTV Reminder (days before renewal)"
            type="number"
            min="1"
            max="30"
            value={form.dstv_reminder_days}
            onChange={(e) => setForm({ ...form, dstv_reminder_days: Number(e.target.value) })}
          />
          <Input
            label="Yaka Reminder (days before monthly reload)"
            type="number"
            min="1"
            max="30"
            value={form.yaka_reminder_days}
            onChange={(e) => setForm({ ...form, yaka_reminder_days: Number(e.target.value) })}
          />
          <CurrencyInput
            label="Fuel Price per Litre (UGX)"
            min="0"
            value={form.fuel_price_per_litre}
            onValueChange={(fuelPrice) => setForm({ ...form, fuel_price_per_litre: parseCurrencyInput(fuelPrice) })}
          />
          <Input
            label="Delete Entry Password"
            type="password"
            value={form.branch_delete_password}
            onChange={(e) => setForm({ ...form, branch_delete_password: e.target.value })}
            placeholder="Required before branch users can delete entries"
          />

          <div className="sm:col-span-2 border-t border-slate-200 dark:border-slate-800 pt-4 mt-1">
            <div className="flex items-center gap-2">
              <Tv size={16} className="text-brand-600" />
              <h4 className="font-semibold text-slate-800 dark:text-slate-100">DSTV Package Prices</h4>
            </div>
            <p className="text-xs text-slate-400 mt-1">These values fill the branch DSTV payment form; users can still choose Other amount.</p>
          </div>

          {DSTV_PACKAGES.map((pkg) => (
            <CurrencyInput
              key={pkg}
              label={`${pkg} (UGX)`}
              min="0"
              value={form.dstv_package_prices[pkg]}
              onValueChange={(amount) =>
                setForm({
                  ...form,
                  dstv_package_prices: {
                    ...form.dstv_package_prices,
                    [pkg]: parseCurrencyInput(amount),
                  },
                })
              }
            />
          ))}

          <div className="sm:col-span-2 border-t border-slate-200 dark:border-slate-800 pt-4 mt-1">
            <div className="flex items-center gap-2">
              <Lightbulb size={16} className="text-brand-600" />
              <h4 className="font-semibold text-slate-800 dark:text-slate-100">Branch Utility Numbers</h4>
            </div>
            <p className="text-xs text-slate-400 mt-1">Saved numbers are reused by branch forms so users do not repeat fixed branch information.</p>
          </div>

          {branchUtilityError && (
            <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-900/10 dark:text-amber-300">
              {branchUtilityError}
            </div>
          )}

          <div className="sm:col-span-2 space-y-3">
            {branchUtilityRows.length === 0 ? (
              <p className="text-sm text-slate-400">No active branches found.</p>
            ) : (
              branchUtilityRows.map((row) => {
                const isOpen = openUtilityBranches.has(row.branch_id)
                const hasDstv = Boolean(row.dstv_smart_card_number.trim())
                const hasYaka = Boolean(row.yaka_meter_number.trim())
                return (
                  <div key={row.branch_id} className="rounded-xl border border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      className="flex w-full flex-col gap-3 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
                      onClick={() => toggleUtilityBranch(row.branch_id)}
                      aria-expanded={isOpen}
                    >
                      <div className="min-w-0">
                        <h5 className="font-semibold text-slate-800 dark:text-slate-100">{row.name}</h5>
                        <p className="text-xs text-slate-400">{row.region}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Badge tone={hasDstv ? 'green' : 'slate'}>{hasDstv ? 'DSTV saved' : 'DSTV empty'}</Badge>
                        <Badge tone={hasYaka ? 'green' : 'slate'}>{hasYaka ? 'Yaka saved' : 'Yaka empty'}</Badge>
                        <ChevronDown
                          size={18}
                          className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </button>
                    {isOpen && (
                      <div className="grid gap-3 border-t border-slate-200 px-4 pb-4 pt-3 dark:border-slate-800 sm:grid-cols-2">
                        <Input
                          label="DSTV Smart Card Number"
                          value={row.dstv_smart_card_number}
                          onChange={(e) => updateBranchUtilityRow(row.branch_id, 'dstv_smart_card_number', e.target.value)}
                        />
                        <Input
                          label="Yaka Meter Number"
                          value={row.yaka_meter_number}
                          onChange={(e) => updateBranchUtilityRow(row.branch_id, 'yaka_meter_number', e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          <div className="sm:col-span-2 border-t border-slate-200 dark:border-slate-800 pt-4 mt-1">
            <div className="flex items-center gap-2">
              <Send size={16} className="text-brand-600" />
              <h4 className="font-semibold text-slate-800 dark:text-slate-100">Telegram Configuration by Region</h4>
            </div>
            <p className="text-xs text-slate-400 mt-1">Branch alerts are sent only to the encrypted Telegram destination configured for that branch region.</p>
          </div>

          {(regionLoadError || telegramStatusError || branchesMissingRegion > 0 || missingTelegramRegions.length > 0) && (
            <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-900/10 dark:text-amber-300">
              {regionLoadError && <p>{regionLoadError}</p>}
              {telegramStatusError && <p>{telegramStatusError}</p>}
              {branchesMissingRegion > 0 && <p>{branchesMissingRegion} branch(es) do not have a region assigned.</p>}
              {missingTelegramRegions.length > 0 && <p>Missing Telegram configuration for: {missingTelegramRegions.join(', ')}.</p>}
            </div>
          )}

          <div className="sm:col-span-2 space-y-3">
            {telegramActionMessage && <p className="text-sm text-emerald-600">{telegramActionMessage}</p>}
            {telegramStatusLoading ? (
              <p className="text-sm text-slate-400">Checking encrypted Telegram configuration...</p>
            ) : regions.length === 0 && !regionLoadError ? (
              <p className="text-sm text-slate-400">No active branch regions found.</p>
            ) : (
              regions.map((region) => {
                const status = telegramStatusByRegion.get(region)
                const configured = Boolean(status?.bot_token_configured && status?.chat_id_configured)
                return (
                  <div key={region} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h5 className="font-semibold text-slate-800 dark:text-slate-100">{region}</h5>
                          <Badge tone={configured ? 'green' : 'amber'}>{configured ? 'Configured' : 'Missing setup'}</Badge>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                          <div className="flex items-center gap-2">
                            <EyeOff size={15} className="text-slate-400" />
                            <span>Bot token</span>
                            <Badge tone={status?.bot_token_configured ? 'green' : 'red'}>
                              {status?.bot_token_configured ? 'Hidden' : 'Missing'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <EyeOff size={15} className="text-slate-400" />
                            <span>Chat ID</span>
                            <Badge tone={status?.chat_id_configured ? 'green' : 'red'}>
                              {status?.chat_id_configured ? 'Hidden' : 'Missing'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 sm:justify-end">
                        <Button variant="secondary" type="button" onClick={() => openTelegramModal('edit', region)}>
                          <Pencil size={15} /> {configured ? 'Edit' : 'Configure'}
                        </Button>
                        <Button variant="danger" type="button" onClick={() => openTelegramModal('reset', region)} disabled={!configured}>
                          <Trash2 size={15} /> Reset
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="sm:col-span-2 border-t border-slate-200 dark:border-slate-800 pt-4 mt-1">
            <div className="flex items-center gap-2">
              <Wrench size={16} className="text-brand-600" />
              <h4 className="font-semibold text-slate-800 dark:text-slate-100">Generator Service Defaults</h4>
            </div>
          </div>
          <Input
            label="Technician Name"
            value={form.generator_service_technician_name}
            onChange={(e) => setForm({ ...form, generator_service_technician_name: e.target.value })}
          />
          <Input
            label="Technician Phone"
            value={form.generator_service_technician_phone}
            onChange={(e) => setForm({ ...form, generator_service_technician_phone: e.target.value })}
          />
          <Input
            label="Company (optional)"
            value={form.generator_service_company}
            onChange={(e) => setForm({ ...form, generator_service_company: e.target.value })}
          />
          <Input
            label="Work Done"
            value={form.generator_service_work_done}
            onChange={(e) => setForm({ ...form, generator_service_work_done: e.target.value })}
          />
          <div className="sm:col-span-2">
            <Textarea
              label="Service Remark"
              value={form.generator_service_remarks}
              onChange={(e) => setForm({ ...form, generator_service_remarks: e.target.value })}
            />
          </div>
        </div>
        {(settingsError || settingsSaveError) && <p className="text-sm text-red-500 mt-3">{settingsError || settingsSaveError}</p>}
        {settingsSaved && <p className="text-sm text-emerald-600 mt-3">Settings saved.</p>}
        <Button className="mt-4" onClick={saveSettings} disabled={savingSettings || settingsLoading}>
          {savingSettings ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-2">
          <Send size={18} className="text-brand-600" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Telegram Reminder Sweep</h3>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          Test any date without sending Telegram messages, or run the live reminder checks for today.
        </p>
        <div className="grid gap-3 md:grid-cols-[minmax(180px,240px)_auto_auto] md:items-end">
          <Input
            label="Reminder Test Date"
            type="date"
            value={reminderTestDate}
            onChange={(e) => setReminderTestDate(e.target.value)}
          />
          <Button variant="secondary" onClick={testReminderDate} disabled={testingReminders || sweeping}>
            {testingReminders ? 'Testing...' : 'Test Date Only'}
          </Button>
          <Button variant="primary" onClick={testSweep} disabled={sweeping || testingReminders}>
            {sweeping ? 'Running...' : 'Run Live Sweep'}
          </Button>
        </div>
        {sweepMessage && <p className="text-xs text-slate-500 mt-2 break-words">{sweepMessage}</p>}
      </div>

      <div className="card border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />
              <h3 className="font-semibold text-red-900 dark:text-red-200">Reset System Data</h3>
            </div>
            <p className="text-sm text-red-800/80 dark:text-red-200/80">
              Clear all branch entries, notifications, reports history, and device approvals. Branches, admin accounts, and settings stay available.
            </p>
            {resetSuccess && <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-3">System data was reset successfully.</p>}
          </div>
          <Button
            variant="danger"
            className="shrink-0"
            onClick={() => {
              setResetError(null)
              setResetModalOpen(true)
            }}
          >
            <RotateCcw size={16} /> Reset
          </Button>
        </div>
      </div>

      <Modal open={Boolean(telegramModal)} onClose={closeTelegramModal} title={telegramModal?.mode === 'reset' ? 'Reset Telegram configuration' : 'Edit Telegram configuration'}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand-600" />
            <p>
              {telegramModal?.mode === 'reset'
                ? `This removes the encrypted Telegram destination for ${telegramModal.region}.`
                : `Enter new values for ${telegramModal?.region}. Saved values are encrypted and will not be shown again.`}
            </p>
          </div>

          {telegramModal?.mode === 'edit' && (
            <div className="grid gap-3">
              <Input
                label="Bot Token"
                type="password"
                autoComplete="new-password"
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
              />
              <Input
                label="Chat ID"
                type="password"
                autoComplete="new-password"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
              />
            </div>
          )}

          <Input
            label="Reset Password"
            type="password"
            autoFocus={telegramModal?.mode === 'reset'}
            autoComplete="current-password"
            value={telegramPassword}
            onChange={(e) => setTelegramPassword(e.target.value)}
            onKeyDown={(e) => {
              const ready = telegramPassword && (telegramModal?.mode === 'reset' || (telegramBotToken && telegramChatId))
              if (e.key === 'Enter' && ready && !telegramSaving) void submitTelegramConfig()
            }}
          />
          {telegramActionError && <p className="text-sm text-red-500">{telegramActionError}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={closeTelegramModal} disabled={telegramSaving}>
              Cancel
            </Button>
            <Button
              variant={telegramModal?.mode === 'reset' ? 'danger' : 'primary'}
              onClick={() => void submitTelegramConfig()}
              disabled={telegramSaving || !telegramPassword || (telegramModal?.mode === 'edit' && (!telegramBotToken || !telegramChatId))}
            >
              {telegramSaving ? 'Saving...' : telegramModal?.mode === 'reset' ? 'Reset Configuration' : 'Save Configuration'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={resetModalOpen}
        onClose={() => {
          if (!resetting) {
            setResetModalOpen(false)
            setResetPassword('')
          }
        }}
        title="Reset system data"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This will remove all operational records and free every branch for fresh device selection. Enter the reset password to continue.
          </p>
          <Input
            label="Reset Password"
            type="password"
            autoFocus
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && resetPassword && !resetting) void submitSystemReset()
            }}
          />
          {resetError && <p className="text-sm text-red-500">{resetError}</p>}
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                if (!resetting) {
                  setResetModalOpen(false)
                  setResetPassword('')
                }
              }}
              disabled={resetting}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void submitSystemReset()} disabled={resetting || !resetPassword}>
              {resetting ? 'Resetting...' : 'Reset Everything'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
