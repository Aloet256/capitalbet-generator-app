// Supabase Edge Function: telegram-reminders
// Schedule once per day (for example 07:00 Africa/Kampala) and invoke with
// the service-role Authorization header. Authenticated admins can also run it
// manually from Admin Settings.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface TelegramDestination {
  bot_token?: string
  chat_id?: string
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function todayLabel(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kampala',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date())
}

function detailLine(icon: string, label: string, content: unknown): string {
  return `${icon} <b>${label}:</b> ${escapeHtml(content || '-')}`
}

function telegramMessage(title: string, icon: string, lines: string[]): string {
  return [`<b>${todayLabel()}</b>`, '', `${icon} <b>${title}</b>`, '', ...lines].join('\n')
}

function dateOnlyKampala(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kampala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function addDays(days: number): string {
  return dateOnlyKampala(new Date(Date.now() + days * 86400000))
}

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  return (data?.value as T) ?? fallback
}

async function isAuthorized(req: Request): Promise<boolean> {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  if (token === SERVICE_ROLE_KEY) return true

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return false
  const { data: admin } = await supabase
    .from('admins')
    .select('id')
    .eq('auth_user_id', data.user.id)
    .maybeSingle()
  return Boolean(admin)
}

async function recordAdminWarning(message: string) {
  const { error } = await supabase.from('notifications').insert({
    branch_id: null,
    type: 'system',
    channel: 'in_app',
    title: 'Telegram region not configured',
    message,
    telegram_sent: false,
  })
  if (error) console.error('Failed to record Telegram configuration warning', error)
}

async function getEncryptedRegionDestination(region: string): Promise<{ botToken: string; chatId: string } | null> {
  const { data, error } = await supabase
    .rpc('fn_get_telegram_region_destination', { p_region: region })
    .maybeSingle()

  if (error) {
    console.error('Failed to load encrypted Telegram destination', error)
    return null
  }

  const destination = data as TelegramDestination | null
  const botToken = destination?.bot_token?.trim() ?? ''
  const chatId = destination?.chat_id?.trim() ?? ''
  if (!botToken || !chatId) return null
  return { botToken, chatId }
}

async function getRegionDestination(
  branch: { name?: string | null; region?: string | null } | null,
  reminderType: string,
): Promise<{ botToken: string; chatId: string } | null> {
  const branchName = branch?.name || 'Unknown branch'
  const region = branch?.region?.trim() ?? ''
  if (!region) {
    await recordAdminWarning(`Telegram skipped for ${reminderType} because ${branchName} has no region assigned.`)
    return null
  }

  const destination = await getEncryptedRegionDestination(region)
  if (!destination) {
    await recordAdminWarning(`Telegram skipped for ${reminderType} at ${branchName} (${region}). Configure bot token and chat ID for ${region}.`)
    return null
  }

  return destination
}

async function sendTelegram(botToken: string, chatId: string, text: string): Promise<boolean> {
  if (!chatId || !botToken) return false

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Telegram API error ${response.status}: ${body.slice(0, 300)}`)
  }
  return true
}

async function recordReminder(args: {
  branchId: string
  type: 'service_due' | 'dstv_renewal' | 'yaka_reload_due'
  title: string
  message: string
  relatedTable: string
  relatedId: string
  telegramSent: boolean
}) {
  const { error } = await supabase.from('notifications').insert({
    branch_id: args.branchId,
    type: args.type,
    channel: args.telegramSent ? 'both' : 'in_app',
    title: args.title,
    message: args.message,
    telegram_sent: args.telegramSent,
    telegram_sent_at: args.telegramSent ? new Date().toISOString() : null,
    related_table: args.relatedTable,
    related_id: args.relatedId,
  })
  if (error) throw error
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  if (!(await isAuthorized(req))) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const results = { services: 0, dstv: 0, yaka: 0, telegramFailures: 0 }
  const serviceDays = Number(await getSetting('service_reminder_days', 5))
  const dstvDays = Number(await getSetting('dstv_reminder_days', 5))
  const yakaDays = Number(await getSetting('yaka_reminder_days', 3))

  const { data: dueServices, error: serviceError } = await supabase
    .from('services')
    .select('id, branch_id, next_service_date, reminder_sent, branches(name, region, active)')
    .eq('reminder_sent', false)
    .lte('next_service_date', addDays(serviceDays))

  if (serviceError) throw serviceError
  for (const s of dueServices ?? []) {
    if ((s as any).branches?.active === false) continue
    const branchName = (s as any).branches?.name ?? 'Branch'
    const destination = await getRegionDestination((s as any).branches ?? null, 'generator service reminder')
    let telegramSent = false
    try {
      if (destination) telegramSent = await sendTelegram(
        destination.botToken,
        destination.chatId,
        telegramMessage('GENERATOR SERVICE REMINDER', '🔧', [
          detailLine('🏢', 'Branch', branchName),
          detailLine('📅', 'Due date', s.next_service_date),
        ]),
      )
    } catch (error) {
      console.error(error)
      results.telegramFailures++
    }
    await recordReminder({
      branchId: s.branch_id,
      type: 'service_due',
      title: 'Generator service due',
      message: `Generator service is due on ${s.next_service_date}.`,
      relatedTable: 'services',
      relatedId: s.id,
      telegramSent,
    })
    await supabase.from('services').update({ reminder_sent: true }).eq('id', s.id)
    results.services++
  }

  const { data: dueDstv, error: dstvError } = await supabase
    .from('dstv_subscriptions')
    .select('id, branch_id, renewal_date, package, reminder_sent, branches(name, region, active)')
    .eq('reminder_sent', false)
    .lte('renewal_date', addDays(dstvDays))

  if (dstvError) throw dstvError
  for (const d of dueDstv ?? []) {
    if ((d as any).branches?.active === false) continue
    const branchName = (d as any).branches?.name ?? 'Branch'
    const destination = await getRegionDestination((d as any).branches ?? null, 'DSTV renewal reminder')
    let telegramSent = false
    try {
      if (destination) telegramSent = await sendTelegram(
        destination.botToken,
        destination.chatId,
        telegramMessage('DSTV RENEWAL REMINDER', '📺', [
          detailLine('🏢', 'Branch', branchName),
          detailLine('📦', 'Package', (d as any).package),
          detailLine('📅', 'Renewal date', d.renewal_date),
        ]),
      )
    } catch (error) {
      console.error(error)
      results.telegramFailures++
    }
    await recordReminder({
      branchId: d.branch_id,
      type: 'dstv_renewal',
      title: 'DSTV renewal due',
      message: `${d.package} package renews on ${d.renewal_date}.`,
      relatedTable: 'dstv_subscriptions',
      relatedId: d.id,
      telegramSent,
    })
    await supabase.from('dstv_subscriptions').update({ reminder_sent: true }).eq('id', d.id)
    results.dstv++
  }

  const { data: branches, error: branchError } = await supabase
    .from('branches')
    .select('id, name, region')
    .eq('active', true)
  if (branchError) throw branchError

  for (const branch of branches ?? []) {
    const { data: latest, error: yakaError } = await supabase
      .from('yaka_purchases')
      .select('id, expected_reload_date, reminder_sent')
      .eq('branch_id', branch.id)
      .order('purchase_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (yakaError) throw yakaError
    if (!latest || latest.reminder_sent || latest.expected_reload_date > addDays(yakaDays)) continue

    const destination = await getRegionDestination(branch, 'Yaka reload reminder')
    let telegramSent = false
    try {
      if (destination) telegramSent = await sendTelegram(
        destination.botToken,
        destination.chatId,
        telegramMessage('YAKA RELOAD REMINDER', '⚡', [
          detailLine('🏢', 'Branch', branch.name),
          detailLine('📅', 'Expected reload', latest.expected_reload_date),
        ]),
      )
    } catch (error) {
      console.error(error)
      results.telegramFailures++
    }
    await recordReminder({
      branchId: branch.id,
      type: 'yaka_reload_due',
      title: 'Yaka reload due',
      message: `The next monthly Yaka load is expected by ${latest.expected_reload_date}.`,
      relatedTable: 'yaka_purchases',
      relatedId: latest.id,
      telegramSent,
    })
    await supabase.from('yaka_purchases').update({ reminder_sent: true }).eq('id', latest.id)
    results.yaka++
  }

  return new Response(JSON.stringify({ ok: true, results, checked_at: new Date().toISOString() }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
