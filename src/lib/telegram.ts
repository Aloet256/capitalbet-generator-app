import { supabase } from './supabase'

// The bot token must never live in frontend code. All actual Telegram
// sending happens server-side inside the `telegram-reminders` Supabase Edge
// Function (see /supabase/functions/telegram-reminders). This helper just
// lets Admin Settings trigger that function on-demand (e.g. "Send test /
// run reminders now" button) via a normal authenticated function invocation.

export async function runReminderSweepNow(): Promise<{ ok: boolean; message: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('telegram-reminders', { method: 'POST' })
    if (error) throw error
    return { ok: true, message: `Reminder sweep complete: ${JSON.stringify(data?.results ?? {})}` }
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
