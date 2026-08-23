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

function todayLabel(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kampala',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date())
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
  const region = branch?.region ? escapeHtml(branch.region) : value(details, 'region', '')
  const branchLine = detailLine('Branch', `${branchName}${region ? ` (${region})` : ''}`)
  const location = section('Location', [branchLine])

  switch (payload.type) {
    case 'device_request':
      return telegramMessage('Device Access Request', '🖥️', 'Admin review is required before this device can continue.', [
        ...location,
        '',
        ...section('Request Details', [
          detailLine('Access type', value(details, 'access_type')),
          detailLine('Device', value(details, 'device_label')),
          detailLine('Requested', value(details, 'requested_at')),
        ]),
      ])

    case 'device_approved':
      return telegramMessage('Device Access Approved', '✅', 'This device is now allowed to use the selected branch.', [
        ...location,
        '',
        ...section('Approval Details', [
          detailLine('Access type', value(details, 'access_type')),
          detailLine('Device', value(details, 'device_label')),
        ]),
      ])

    case 'device_revoked':
      return telegramMessage('Device Access Revoked', '🚫', 'A device has been blocked from branch access.', [
        ...location,
        '',
        ...section('Device Details', [detailLine('Device', value(details, 'device_label'))]),
      ])

    case 'device_restored':
      return telegramMessage('Device Access Restored', '✅', 'A previously revoked device has been restored.', [
        ...location,
        '',
        ...section('Device Details', [detailLine('Device', value(details, 'device_label'))]),
      ])

    case 'power_outage_started':
      return telegramMessage('Power Outage Started', '🔌', 'Generator support is now active for this branch.', [
        ...location,
        '',
        ...section('Outage Details', [
          detailLine('Started', value(details, 'started_at')),
          detailLine('Notes', value(details, 'notes')),
        ]),
      ])

    case 'power_outage_stopped':
      return telegramMessage('Power Restored', '💡', 'Mains power is back and generator runtime has been recorded.', [
        ...location,
        '',
        ...section('Restoration Summary', [
          detailLine('Started', value(details, 'started_at')),
          detailLine('Restored', value(details, 'ended_at')),
          detailLine('Generator runtime', minutes(details.duration_minutes)),
        ]),
      ])

    case 'fuel_refill':
      return telegramMessage('Fuel Refill Logged', '⛽', 'A generator fuel refill has been recorded.', [
        ...location,
        '',
        ...section('Refill Summary', [
          detailLine('Date', value(details, 'refill_date')),
          detailLine('Litres', value(details, 'litres')),
          detailLine('Cost', money(details.cost)),
          detailLine('Authorized by', value(details, 'authorized_by')),
          detailLine('Remarks', value(details, 'remarks')),
        ]),
      ])

    case 'service_record':
      return telegramMessage('Generator Service Completed', '🔧', 'A generator service record has been submitted.', [
        ...location,
        '',
        ...section('Service Details', [
          detailLine('Service date', value(details, 'service_date')),
          detailLine('Technician', value(details, 'technician_name')),
          detailLine('Phone', value(details, 'technician_phone')),
          detailLine('Company', value(details, 'company')),
          detailLine('Repair details', serviceDetails(details)),
          detailLine('Cost', money(details.cost)),
          detailLine('Work done', value(details, 'work_done')),
          detailLine('Remarks', value(details, 'remarks')),
        ]),
      ])

    case 'repair_record':
      return telegramMessage('Repair Logged', '🛠️', 'A branch repair has been recorded for follow-up and reporting.', [
        ...location,
        '',
        ...section('Repair Details', [
          detailLine('Date', value(details, 'repair_date')),
          detailLine('Category', value(details, 'category')),
          detailLine('Description', value(details, 'description')),
          detailLine('Cost', money(details.cost)),
        ]),
      ])

    case 'dstv_subscription':
      return telegramMessage('DSTV Subscription Recorded', '📺', 'Entertainment utility payment has been captured.', [
        ...location,
        '',
        ...section('Subscription Details', [
          detailLine('Date', value(details, 'subscription_date')),
          detailLine('Package', value(details, 'package')),
          detailLine('Smart card', value(details, 'smart_card_number')),
          detailLine('Amount', money(details.amount)),
          detailLine('Remarks', value(details, 'remarks')),
        ]),
      ])

    case 'yaka_purchase':
      return telegramMessage('Yaka Purchase Recorded', '⚡', 'Electricity token purchase has been captured.', [
        ...location,
        '',
        ...section('Purchase Details', [
          detailLine('Date', value(details, 'purchase_date')),
          detailLine('Expected reload', value(details, 'expected_reload_date')),
          detailLine('Meter', value(details, 'meter_number')),
          detailLine('Units', value(details, 'units')),
          detailLine('Amount', money(details.amount)),
          detailLine('Remarks', value(details, 'remarks')),
        ]),
      ])
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
