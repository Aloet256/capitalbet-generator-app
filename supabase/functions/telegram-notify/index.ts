// Supabase Edge Function: telegram-notify
// Sends live Telegram messages for records entered in the branch/admin app.
// Bot tokens are stored in admin-only app_settings and used only server-side.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-fingerprint',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type TelegramEventType =
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

interface NotifyPayload {
  type: TelegramEventType
  branchId?: string
  details?: Record<string, unknown>
}

interface TelegramDestination {
  bot_token?: string
  chat_id?: string
}

type MessageLine = string | null | undefined | false

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function value(details: Record<string, unknown>, key: string, fallback = '-'): string {
  const raw = details[key]
  if (raw === null || raw === undefined || raw === '') return fallback
  return escapeHtml(raw)
}

function money(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '-'
  const amount = Number(raw)
  if (!Number.isFinite(amount)) return '-'
  return `UGX ${amount.toLocaleString('en-US')}`
}

function serviceDetails(details: Record<string, unknown>): string {
  const values = [details.items_replaced, details.repairs_done].filter((item) => item !== null && item !== undefined && item !== '')
  return values.length ? values.map(escapeHtml).join(' / ') : '-'
}

function minutes(raw: unknown): string {
  const amount = Number(raw)
  if (!Number.isFinite(amount)) return '-'
  return `${Math.max(0, Math.round(amount)).toLocaleString('en-US')} min`
}

function parseDateOnly(raw: unknown): Date | null {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const [, year, month, day] = match
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  }

  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

function ordinalDay(day: number): string {
  const mod100 = day % 100
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`
  const suffix = day % 10 === 1 ? 'st' : day % 10 === 2 ? 'nd' : day % 10 === 3 ? 'rd' : 'th'
  return `${day}${suffix}`
}

function longDate(raw: unknown): string {
  const date = parseDateOnly(raw)
  if (!date) return '-'
  const month = date.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })
  return `${ordinalDay(date.getUTCDate())} ${month} ${date.getUTCFullYear()}`
}

function nextMonthDate(raw: unknown): string {
  const date = parseDateOnly(raw)
  if (!date) return '-'
  date.setUTCMonth(date.getUTCMonth() + 1)
  return longDate(date.toISOString().slice(0, 10))
}

function todayLabel(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kampala',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date())
}

function formatDateTimeParts(raw: unknown): { date: string; time: string } {
  const text = String(raw ?? '').trim()
  const fallback = { date: todayLabel(), time: '-' }
  if (!text) return fallback

  if (/^\d{4}-\d{2}-\d{2}/.test(text) || /(?:Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    const date = new Date(text)
    if (!Number.isNaN(date.getTime())) {
      return {
        date: new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Africa/Kampala',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(date),
        time: new Intl.DateTimeFormat('en-US', {
          timeZone: 'Africa/Kampala',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }).format(date),
      }
    }
  }

  const [dateText, timeText] = text.split(',').map((part) => part.trim())
  const dateParts = dateText?.split(/[/-]/).map(Number)
  if (dateParts?.length === 3 && dateParts.every(Number.isFinite)) {
    let [first, second, year] = dateParts
    if (first > 31) [year, first, second] = dateParts
    const month = first > 12 ? second : first
    const day = first > 12 ? first : second
    const date = new Date(Date.UTC(year, month - 1, day))
    if (!Number.isNaN(date.getTime())) {
      return {
        date: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
        time: timeText ? timeText.replace(/\s+/g, ' ').toUpperCase() : fallback.time,
      }
    }
  }

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return fallback
  return {
    date: parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Kampala' }),
    time: parsed.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'Africa/Kampala',
    }),
  }
}

function generatorDuration(raw: unknown): string {
  const amount = Number(raw)
  if (!Number.isFinite(amount)) return '-'
  const totalMinutes = Math.max(1, Math.round(amount))
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  const parts: string[] = []
  if (hours) parts.push(`${hours} ${hours === 1 ? 'HOUR' : 'HOURS'}`)
  if (mins || parts.length === 0) parts.push(`${mins} ${mins === 1 ? 'MINUTE' : 'MINUTES'}`)
  return parts.join(' ')
}

function notesLine(raw: unknown): string {
  const clean = String(raw ?? '').trim()
  if (!clean || clean === '-') return '<b>NOTES:-</b>'
  return `<b>NOTES:</b> ${escapeHtml(clean)}`
}

function compactLines(lines: MessageLine[]): string[] {
  const result = lines.filter((line): line is string => typeof line === 'string')
  while (result[result.length - 1] === '') result.pop()
  return result
}

function detailLine(label: string, content: string): string | null {
  const clean = content.trim()
  if (!clean || clean === '-') return null
  return `• <b>${label}:</b> ${clean}`
}

function section(title: string, lines: MessageLine[]): MessageLine[] {
  const clean = compactLines(lines)
  return clean.length ? [`<b>${title}</b>`, ...clean] : []
}

function telegramMessage(title: string, icon: string, tone: string, lines: MessageLine[]): string {
  const body = compactLines(lines)
  return compactLines([
    `${icon} <b>${title}</b>`,
    tone ? `<i>${escapeHtml(tone)}</i>` : null,
    '',
    `<b>Sent:</b> ${todayLabel()}`,
    ...(body.length ? ['', ...body] : []),
  ]).join('\n')
}

async function getBranch(branchId?: string) {
  if (!branchId) return null
  const { data, error } = await supabase
    .from('branches')
    .select('id, name, region')
    .eq('id', branchId)
    .maybeSingle()
  if (error) throw error
  return data
}

function eventLabel(type: TelegramEventType): string {
  return type.replaceAll('_', ' ')
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
  branch: { name: string | null; region: string | null } | null,
  type: TelegramEventType,
): Promise<{ botToken: string; chatId: string } | null> {
  const branchName = branch?.name || 'Unknown branch'
  const region = branch?.region?.trim() ?? ''
  if (!region) {
    await recordAdminWarning(`Telegram skipped for ${eventLabel(type)} because ${branchName} has no region assigned.`)
    return null
  }

  const destination = await getEncryptedRegionDestination(region)
  if (!destination) {
    await recordAdminWarning(`Telegram skipped for ${eventLabel(type)} at ${branchName} (${region}). Configure bot token and chat ID for ${region}.`)
    return null
  }

  return destination
}

async function isAdminToken(token: string): Promise<boolean> {
  if (!token) return false
  if (token === SERVICE_ROLE_KEY) return true

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return false
  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', data.user.id).maybeSingle()
  return Boolean(admin)
}

async function isAuthorized(req: Request, payload: NotifyPayload): Promise<boolean> {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (await isAdminToken(token)) return true

  if (!payload.branchId) return false
  const fingerprint = req.headers.get('x-device-fingerprint') ?? ''
  if (!fingerprint) return false

  const statuses = payload.type === 'device_request' ? ['pending', 'approved'] : ['approved']
  const { data, error } = await supabase
    .from('devices')
    .select('id')
    .eq('branch_id', payload.branchId)
    .eq('device_fingerprint', fingerprint)
    .in('status', statuses)
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}

function buildMessage(payload: NotifyPayload, branch: { name: string | null; region: string | null } | null): string {
  const details = payload.details ?? {}
  const branchName = branch?.name ? escapeHtml(branch.name) : value(details, 'branch_name', 'Branch')
  const branchHeading = branch?.name ? escapeHtml(branch.name.toUpperCase()) : value(details, 'branch_name', 'Branch').toUpperCase()
  const region = branch?.region ? escapeHtml(branch.region) : value(details, 'region', '')
  const branchLine = detailLine('🏢 Branch', `${branchName}${region ? ` (${region})` : ''}`)
  const location = section('Location', [branchLine])

  switch (payload.type) {
    case 'device_request':
      return telegramMessage('Device Access Request', '🖥️', 'Admin review is required before this device can continue.', [
        ...location,
        '',
        ...section('Request Details', [
          detailLine('🔐 Access type', value(details, 'access_type')),
          detailLine('💻 Device', value(details, 'device_label')),
          detailLine('🕒 Requested', value(details, 'requested_at')),
        ]),
      ])

    case 'device_approved':
      return telegramMessage('Device Access Approved', '✅', 'This device is now allowed to use the selected branch.', [
        ...location,
        '',
        ...section('Approval Details', [
          detailLine('🔐 Access type', value(details, 'access_type')),
          detailLine('💻 Device', value(details, 'device_label')),
        ]),
      ])

    case 'device_revoked':
      return telegramMessage('Device Access Revoked', '🚫', 'A device has been blocked from branch access.', [
        ...location,
        '',
        ...section('Device Details', [detailLine('💻 Device', value(details, 'device_label'))]),
      ])

    case 'device_restored':
      return telegramMessage('Device Access Restored', '✅', 'A previously revoked device has been restored.', [
        ...location,
        '',
        ...section('Device Details', [detailLine('💻 Device', value(details, 'device_label'))]),
      ])

    case 'power_outage_started': {
      const started = formatDateTimeParts(details.started_at)
      return compactLines([
        `<b>POWER OFF AT: ${branchHeading}</b>${region ? ` (${region})` : ''}`,
        `<b>DATE: ${started.date}</b>`,
        '',
        `🔌 <b>POWER OFF AT:</b> ${escapeHtml(started.time)}`,
        '⏰ <b>STARTED</b>',
        '<b>RUNNING ON GENERATOR NOW</b>',
        notesLine(details.notes),
      ]).join('\n')
    }

    case 'power_outage_stopped': {
      const started = formatDateTimeParts(details.started_at)
      const ended = formatDateTimeParts(details.ended_at)
      return compactLines([
        `<b>POWER IS BACK AT: ${branchHeading}</b>${region ? ` (${region})` : ''}`,
        `<b>DATE: ${ended.date}</b>`,
        '',
        `🔌 <b>POWER BACK:</b> ${escapeHtml(ended.time)}`,
        `⏰ <b>OFF AT:</b> ${escapeHtml(started.time)}`,
        `<b>TIME SPENT ON GENERATOR: ${generatorDuration(details.duration_minutes)}</b>`,
      ]).join('\n')
    }

    case 'fuel_refill':
      return telegramMessage('Fuel Refill Logged', '⛽', 'A generator fuel refill has been recorded.', [
        ...location,
        '',
        ...section('Refill Summary', [
          detailLine('📅 Date', value(details, 'refill_date')),
          detailLine('🛢️ Litres', value(details, 'litres')),
          detailLine('💰 Cost', money(details.cost)),
          detailLine('👤 Authorized by', value(details, 'authorized_by')),
          detailLine('📝 Remarks', value(details, 'remarks')),
        ]),
      ])

    case 'service_record':
      return telegramMessage('Generator Service Completed', '🔧', 'A generator service record has been submitted.', [
        ...location,
        '',
        ...section('Service Details', [
          detailLine('📅 Service date', value(details, 'service_date')),
          detailLine('👷 Technician', value(details, 'technician_name')),
          detailLine('☎️ Phone', value(details, 'technician_phone')),
          detailLine('🏢 Company', value(details, 'company')),
          detailLine('🛠️ Repair details', serviceDetails(details)),
          detailLine('💰 Cost', money(details.cost)),
          detailLine('✅ Work done', value(details, 'work_done')),
          detailLine('📝 Remarks', value(details, 'remarks')),
        ]),
      ])

    case 'repair_record':
      return telegramMessage('Repair Logged', '🛠️', 'A branch repair has been recorded for follow-up and reporting.', [
        ...location,
        '',
        ...section('Repair Details', [
          detailLine('📅 Date', value(details, 'repair_date')),
          detailLine('🏷️ Category', value(details, 'category')),
          detailLine('🧾 Description', value(details, 'description')),
          detailLine('💰 Cost', money(details.cost)),
        ]),
      ])

    case 'dstv_subscription': {
      const subscriptionDate = value(details, 'subscription_date')
      const nextSubscriptionDate = details.renewal_date ? longDate(details.renewal_date) : nextMonthDate(details.subscription_date)
      return compactLines([
        '📺 <b>DSTV Subscription</b>',
        `<b>Branch: ${branchName}${region ? ` (${region})` : ''}</b>`,
        'Entertainment utility payment has been captured.',
        `<b>Date:</b> <b>${longDate(details.subscription_date)}</b>`,
        '',
        '<b>Subscription Details</b>',
        ...compactLines([
          detailLine('📅 Date', subscriptionDate),
          detailLine('📦 Package', value(details, 'package')),
          detailLine('💳 Smart card', value(details, 'smart_card_number')),
          detailLine('💰 Amount', money(details.amount)),
          detailLine('📝 Remarks', value(details, 'remarks')),
        ]),
        `<b>Next Subscription Date:</b> ${nextSubscriptionDate}`,
      ]).join('\n')
    }

    case 'yaka_purchase': {
      const purchaseDate = value(details, 'purchase_date')
      const nextReloadDate = details.expected_reload_date ? longDate(details.expected_reload_date) : nextMonthDate(details.purchase_date)
      return compactLines([
        '⚡️ <b>Yaka Purchase Recorded</b>',
        `<b>Branch: ${branchName}${region ? ` (${region})` : ''}</b>`,
        'Electricity token purchase has been captured.',
        `<b>Date:</b> <b>${longDate(details.purchase_date)}</b>`,
        '',
        '<b>Purchase Details</b>',
        ...compactLines([
          detailLine('📅 Date', purchaseDate),
          detailLine('🔢 Meter', value(details, 'meter_number')),
          detailLine('⚡ Units', value(details, 'units')),
          detailLine('💰 Amount', money(details.amount)),
          detailLine('📝 Remarks', value(details, 'remarks')),
        ]),
        `<b>Next Reload Date:</b> ${nextReloadDate}`,
      ]).join('\n')
    }
  }
}

async function sendTelegram(botToken: string, chatId: string, text: string) {
  if (!botToken) throw new Error('Telegram bot token is not configured')
  if (!chatId) throw new Error('Telegram chat ID is not configured')

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Telegram API error ${response.status}: ${body.slice(0, 300)}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  try {
    const payload = (await req.json()) as NotifyPayload
    if (!payload.type) throw new Error('Missing notification type')
    if (!(await isAuthorized(req, payload))) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const branch = await getBranch(payload.branchId)
    const destination = await getRegionDestination(branch, payload.type)
    if (!destination) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'region_not_configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const text = buildMessage(payload, branch)
    await sendTelegram(destination.botToken, destination.chatId, text)

    return new Response(JSON.stringify({ ok: true, sent_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error(error)
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Telegram notification failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
