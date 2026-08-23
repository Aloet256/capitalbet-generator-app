import { supabase } from './supabase'

// The bot token must never live in frontend code. All actual Telegram
// sending happens server-side inside the `telegram-reminders` Supabase Edge
// Function (see /supabase/functions/telegram-reminders). This helper just
// lets Admin Settings trigger that function on-demand (e.g. dry-run testing /
// run reminders now button) via a normal authenticated function invocation.

type ReminderSweepOptions = {
  dryRun?: boolean
  today?: string
}

type ReminderSweepResponse = {
  dry_run?: boolean
  checked_date?: string
  reminder_windows?: {
    service_days?: number
    service_cutoff?: string
    dstv_days?: number
    dstv_cutoff?: string
    yaka_days?: number
    yaka_cutoff?: string
  }
  results?: {
    services?: number
    dstv?: number
    yaka?: number
    telegramFailures?: number
  }
}

function formatReminderSweepMessage(data: ReminderSweepResponse | null | undefined): string {
  const results = data?.results ?? {}
  const parts = [
    `services ${results.services ?? 0}`,
    `DSTV ${results.dstv ?? 0}`,
    `Yaka ${results.yaka ?? 0}`,
  ]
  if (results.telegramFailures) parts.push(`Telegram failures ${results.telegramFailures}`)

  if (data?.dry_run) {
    const windows = data.reminder_windows
    const cutoffText = windows
      ? ` Cutoffs: service ${windows.service_cutoff}, DSTV ${windows.dstv_cutoff}, Yaka ${windows.yaka_cutoff}.`
      : ''
    return `Reminder test complete for ${data.checked_date ?? 'selected date'}: ${parts.join(', ')}.${cutoffText} No Telegram sent and no records were marked sent.`
  }

  return `Reminder sweep complete: ${parts.join(', ')}.`
}

export async function runReminderSweepNow(options?: ReminderSweepOptions): Promise<{ ok: boolean; message: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('telegram-reminders', {
      method: 'POST',
      body: options ? { dry_run: options.dryRun, today: options.today } : undefined,
    })
    if (error) throw error
    return { ok: true, message: formatReminderSweepMessage(data as ReminderSweepResponse) }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Failed to run reminder sweep' }
  }
}

export type TelegramEntryType =
  | 'device_request'
  | 'device_approved'
  | 'device_revoked'
  | 'device_restored'
  | 'power_outage_started'
  | 'power_outage_stopped'
  | 'fuel_refill'
  | 'service_record'
  | 'repair_record'
  | 'dstv_subscription'
  | 'yaka_purchase'

export async function notifyTelegramEntry(payload: {
  type: TelegramEntryType
  branchId?: string
  details?: Record<string, unknown>
}) {
  try {
    const { error } = await supabase.functions.invoke('telegram-notify', {
      method: 'POST',
      body: payload,
    })
    if (error) throw error
  } catch (err) {
    console.warn('Telegram notification failed', err)
  }
}
