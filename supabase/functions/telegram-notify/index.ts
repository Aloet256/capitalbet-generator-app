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

interface TelegramRegionConfigEntry {
  bot_token?: string
  chat_id?: string
}

type TelegramRegionConfig = Record<string, TelegramRegionConfigEntry>

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

function detailLine(icon: string, label: string, content: string): string {
  return `${icon} <b>${label}:</b> ${content}`
}

function telegramMessage(title: string, icon: string, lines: string[]): string {
  return [`<b>${todayLabel()}</b>`, '', `${icon} <b>${title}</b>`, '', ...lines].join('\n')
}

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  return (data?.value as T) ?? fallback
}

async function getTelegramRegionConfig(): Promise<TelegramRegionConfig> {
  const config = await getSetting<TelegramRegionConfig>('telegram_region_config', {})
  return config && typeof config === 'object' && !Array.isArray(config) ? config : {}
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

  const config = await getTelegramRegionConfig()
  const destination = config[region]
  const botToken = destination?.bot_token?.trim() ?? ''
  const chatId = destination?.chat_id?.trim() ?? ''
  if (!botToken || !chatId) {
    await recordAdminWarning(`Telegram skipped for ${eventLabel(type)} at ${branchName} (${region}). Configure bot token and chat ID for ${region}.`)
    return null
  }

  return { botToken, chatId }
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
  const branchLine = detailLine('🏢', 'Branch', `${branchName}${region ? ` (${region})` : ''}`)

  switch (payload.type) {
    case 'device_request':
      return telegramMessage('DEVICE APPROVAL REQUEST', '🖥️', [
        branchLine,
        detailLine('📟', 'Device', value(details, 'device_label')),
        detailLine('⏰', 'Requested', value(details, 'requested_at')),
      ])

    case 'device_approved':
      return telegramMessage('DEVICE APPROVED', '✅', [branchLine, detailLine('📟', 'Device', value(details, 'device_label'))])

    case 'device_revoked':
      return telegramMessage('DEVICE REVOKED', '🚫', [branchLine, detailLine('📟', 'Device', value(details, 'device_label'))])

    case 'device_restored':
      return telegramMessage('DEVICE RESTORED', '♻️', [branchLine, detailLine('📟', 'Device', value(details, 'device_label'))])

    case 'power_outage_started':
      return telegramMessage('POWER OUTAGE', '🔌', [
        branchLine,
        detailLine('⏰', 'Started', value(details, 'started_at')),
        detailLine('📝', 'Notes', value(details, 'notes')),
      ])

    case 'power_outage_stopped':
      return telegramMessage('POWER RESTORED', '💡', [
        branchLine,
        detailLine('⏰', 'Started', value(details, 'started_at')),
        detailLine('✅', 'Restored', value(details, 'ended_at')),
        detailLine('⏱️', 'Generator runtime', minutes(details.duration_minutes)),
      ])

    case 'fuel_refill':
      return telegramMessage('FUEL', '⛽', [
        branchLine,
        detailLine('📅', 'Date', value(details, 'refill_date')),
        detailLine('🛢️', 'Litres', value(details, 'litres')),
        detailLine('💰', 'Cost', money(details.cost)),
        detailLine('👤', 'Authorized by', value(details, 'authorized_by')),
        detailLine('📝', 'Remarks', value(details, 'remarks')),
      ])

    case 'service_record':
      return telegramMessage('GENERATOR SERVICE', '🔧', [
        branchLine,
        detailLine('📅', 'Service date', value(details, 'service_date')),
        detailLine('👷', 'Technician', value(details, 'technician_name')),
        detailLine('☎️', 'Phone', value(details, 'technician_phone')),
        detailLine('🏢', 'Company', value(details, 'company')),
        detailLine('🛠️', 'Items/repaired done', serviceDetails(details)),
        detailLine('💰', 'Cost', money(details.cost)),
        detailLine('🧾', 'Work done', value(details, 'work_done')),
        detailLine('📝', 'Remarks', value(details, 'remarks')),
      ])

    case 'repair_record':
      return telegramMessage('REPAIR', '🛠️', [
        branchLine,
        detailLine('📅', 'Date', value(details, 'repair_date')),
        detailLine('🏷️', 'Category', value(details, 'category')),
        detailLine('🧾', 'Description', value(details, 'description')),
        detailLine('💰', 'Cost', money(details.cost)),
        detailLine('👤', 'Handled by', value(details, 'handled_by')),
      ])

    case 'dstv_subscription':
      return telegramMessage('DSTV', '📺', [
        branchLine,
        detailLine('📅', 'Date', value(details, 'subscription_date')),
        detailLine('📦', 'Package', value(details, 'package')),
        detailLine('💳', 'Smart card', value(details, 'smart_card_number')),
        detailLine('💰', 'Amount', money(details.amount)),
        detailLine('🧾', 'Receipt', value(details, 'receipt_number')),
      ])

    case 'yaka_purchase':
      return telegramMessage('YAKA', '⚡', [
        branchLine,
        detailLine('📅', 'Date', value(details, 'purchase_date')),
        detailLine('🗓️', 'Expected reload', value(details, 'expected_reload_date')),
        detailLine('🔢', 'Meter', value(details, 'meter_number')),
        detailLine('⚡', 'Units', value(details, 'units')),
        detailLine('💰', 'Amount', money(details.amount)),
        detailLine('🧾', 'Receipt', value(details, 'receipt_number')),
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
