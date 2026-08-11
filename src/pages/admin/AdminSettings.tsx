import { useEffect, useState } from 'react'
import { KeyRound, SlidersHorizontal, Send, Wrench } from 'lucide-react'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { useAppSettings } from '../../hooks/useAppSettings'
import { Input } from '../../components/ui/Input'
import { CurrencyInput } from '../../components/ui/CurrencyInput'
import { Textarea } from '../../components/ui/Textarea'
import { Button } from '../../components/ui/Button'
import { runReminderSweepNow } from '../../lib/telegram'
import { parseCurrencyInput } from '../../lib/utils'
import type { AppSettings } from '../../types/database'

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

  useEffect(() => {
    if (!settingsLoading) setForm(settings)
  }, [settings, settingsLoading])

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
          <div className="sm:col-span-2">
            <Input
              label="Default Telegram Chat ID"
              value={form.telegram_default_chat_id}
              onChange={(e) => setForm({ ...form, telegram_default_chat_id: e.target.value })}
              placeholder="Used when a branch has no dedicated chat"
            />
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
    </div>
  )
}
