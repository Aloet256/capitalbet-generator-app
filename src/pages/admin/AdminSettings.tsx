import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, KeyRound, RotateCcw, SlidersHorizontal, Send, Wrench } from 'lucide-react'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { useAppSettings } from '../../hooks/useAppSettings'
import { Input } from '../../components/ui/Input'
import { CurrencyInput } from '../../components/ui/CurrencyInput'
import { Textarea } from '../../components/ui/Textarea'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { runReminderSweepNow } from '../../lib/telegram'
import { resetSystemData } from '../../lib/systemReset'
import { supabase } from '../../lib/supabase'
import { parseCurrencyInput } from '../../lib/utils'
import type { AppSettings, TelegramRegionConfigEntry } from '../../types/database'

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
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [regions, setRegions] = useState<string[]>([])
  const [regionLoadError, setRegionLoadError] = useState<string | null>(null)
  const [branchesMissingRegion, setBranchesMissingRegion] = useState(0)

  useEffect(() => {
    if (!settingsLoading) setForm(settings)
  }, [settings, settingsLoading])

  useEffect(() => {
    let active = true
    supabase
      .from('branches')
      .select('region')
      .eq('active', true)
      .order('region', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setRegionLoadError(error.message)
          return
        }

        const uniqueRegions = new Set<string>()
        let missing = 0
        for (const row of data ?? []) {
          const region = typeof row.region === 'string' ? row.region.trim() : ''
          if (region) uniqueRegions.add(region)
          else missing += 1
        }
        setRegions([...uniqueRegions].sort((a, b) => a.localeCompare(b)))
        setBranchesMissingRegion(missing)
        setRegionLoadError(null)
      })

    return () => {
      active = false
    }
  }, [])

  const missingTelegramRegions = useMemo(
    () =>
      regions.filter((region) => {
        const config = form.telegram_region_config[region]
        return !config?.bot_token?.trim() || !config?.chat_id?.trim()
      }),
    [form.telegram_region_config, regions]
  )

  const updateTelegramRegionConfig = (region: string, field: keyof TelegramRegionConfigEntry, value: string) => {
    const current = form.telegram_region_config[region] ?? { bot_token: '', chat_id: '' }
    setForm({
      ...form,
      telegram_region_config: {
        ...form.telegram_region_config,
        [region]: {
          ...current,
          [field]: value,
        },
      },
    })
  }

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
    await reload()
    setSavingSettings(false)
    setSettingsSaved(true)
  }

  const testSweep = async () => {
    setSweeping(true)
    setSweepMessage(null)
    const res = await runReminderSweepNow()
    setSweepMessage(res.message)
    setSweeping(false)
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

  return (
    <div className="space-y-6 max-w-3xl">
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
          <Input
            label="System Reset Password"
            type="password"
            value={form.system_reset_password}
            onChange={(e) => setForm({ ...form, system_reset_password: e.target.value })}
            placeholder="Required before the admin reset can run"
          />
          <div className="sm:col-span-2 border-t border-slate-200 dark:border-slate-800 pt-4 mt-1">
            <div className="flex items-center gap-2">
              <Send size={16} className="text-brand-600" />
              <h4 className="font-semibold text-slate-800 dark:text-slate-100">Telegram Configuration by Region</h4>
            </div>
            <p className="text-xs text-slate-400 mt-1">Branch alerts are sent only to the Telegram group configured for that branch region.</p>
          </div>

          {(regionLoadError || branchesMissingRegion > 0 || missingTelegramRegions.length > 0) && (
            <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-900/10 dark:text-amber-300">
              {regionLoadError && <p>{regionLoadError}</p>}
              {branchesMissingRegion > 0 && <p>{branchesMissingRegion} branch(es) do not have a region assigned.</p>}
              {missingTelegramRegions.length > 0 && <p>Missing Telegram configuration for: {missingTelegramRegions.join(', ')}.</p>}
            </div>
          )}

          <div className="sm:col-span-2 space-y-3">
            {regions.length === 0 && !regionLoadError ? (
              <p className="text-sm text-slate-400">No active branch regions found.</p>
            ) : (
              regions.map((region) => {
                const config = form.telegram_region_config[region] ?? { bot_token: '', chat_id: '' }
                return (
                  <div key={region} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                    <h5 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">{region}</h5>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Input
                        label="Bot Token"
                        type="password"
                        value={config.bot_token}
                        onChange={(e) => updateTelegramRegionConfig(region, 'bot_token', e.target.value)}
                      />
                      <Input
                        label="Chat ID"
                        value={config.chat_id}
                        onChange={(e) => updateTelegramRegionConfig(region, 'chat_id', e.target.value)}
                      />
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
          Manually run the service, DSTV, and monthly Yaka reminder checks. The deployed function should also be scheduled daily.
        </p>
        <Button variant="secondary" onClick={testSweep} disabled={sweeping}>
          {sweeping ? 'Running...' : 'Run Now'}
        </Button>
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

      <Modal
        open={resetModalOpen}
        onClose={() => {
          if (!resetting) setResetModalOpen(false)
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
                if (!resetting) setResetModalOpen(false)
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
