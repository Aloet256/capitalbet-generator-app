// Supabase Edge Function: telegram-fuel-reports
// Schedule once per day at 20:00 UTC, which is 23:00 Africa/Kampala.
// It sends the daily regional generator/fuel report every run, plus weekly
// on Sunday and monthly on the last day of the month.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FUEL_REPORT_CRON_SECRET = Deno.env.get('FUEL_REPORT_CRON_SECRET') ?? ''

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ReportMode = 'auto' | 'daily' | 'weekly' | 'monthly'

interface BranchRow {
  id: string
  name: string
  region: string
}

interface FuelRow {
  branch_id: string
  litres: number | string
  cost: number | string
}

interface PowerRow {
  branch_id: string
  started_at: string
  ended_at: string | null
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

function numberValue(value: unknown): number {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function money(value: number): string {
  return `UGX ${Math.round(value).toLocaleString('en-US')}`
}

function litres(value: number): string {
  return `${Number(value.toFixed(2)).toLocaleString('en-US')} L`
}

function generatorTime(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const hours = Math.floor(total / 60)
  const mins = total % 60
  const parts: string[] = []
  if (hours) parts.push(`${hours} ${hours === 1 ? 'HR' : 'HRS'}`)
  if (mins || parts.length === 0) parts.push(`${mins} ${mins === 1 ? 'MINUTE' : 'MINUTES'}`)
  return parts.join(' ')
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

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatDateKey(dateKey: string): string {
  return parseDateKey(dateKey).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatDateSlash(dateKey: string): string {
  const [year, month, day] = dateKey.split('-')
  return `${day}/${month}/${year}`
}

function kampalaDateKeyToUtc(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+03:00`)
}

function shiftDateKey(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function startOfWeekKey(dateKey: string): string {
  const date = parseDateKey(dateKey)
  const day = date.getUTCDay() === 0 ? 7 : date.getUTCDay()
  return shiftDateKey(dateKey, -(day - 1))
}

function startOfMonthKey(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`
}

function nextMonthStartKey(dateKey: string): string {
  const date = parseDateKey(startOfMonthKey(dateKey))
  date.setUTCMonth(date.getUTCMonth() + 1)
  return date.toISOString().slice(0, 10)
}

function isSunday(dateKey: string): boolean {
  return parseDateKey(dateKey).getUTCDay() === 0
}

function isLastDayOfMonth(dateKey: string): boolean {
  return shiftDateKey(dateKey, 1) === nextMonthStartKey(dateKey)
}

function reportRanges(mode: ReportMode, todayKey: string) {
  const ranges = []
  if (mode === 'daily' || mode === 'auto') {
    ranges.push({
      key: 'daily',
      title: 'Daily Generator & Fuel Report',
      start: todayKey,
      end: shiftDateKey(todayKey, 1),
      label: formatDateKey(todayKey),
    })
  }

  if (mode === 'weekly' || (mode === 'auto' && isSunday(todayKey))) {
    const start = startOfWeekKey(todayKey)
    ranges.push({
      key: 'weekly',
      title: 'Weekly Generator & Fuel Report',
      start,
      end: shiftDateKey(todayKey, 1),
      label: `${formatDateKey(start)} - ${formatDateKey(todayKey)}`,
    })
  }

  if (mode === 'monthly' || (mode === 'auto' && isLastDayOfMonth(todayKey))) {
    const start = startOfMonthKey(todayKey)
    ranges.push({
      key: 'monthly',
      title: 'Monthly Generator & Fuel Report',
      start,
      end: nextMonthStartKey(todayKey),
      label: parseDateKey(todayKey).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    })
  }

  return ranges
}

async function isAuthorized(req: Request): Promise<boolean> {
  const cronSecret = req.headers.get('x-cron-secret') ?? ''
  if (FUEL_REPORT_CRON_SECRET && cronSecret === FUEL_REPORT_CRON_SECRET) return true

  const header = req.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  if (token === SERVICE_ROLE_KEY) return true

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return false
  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', data.user.id).maybeSingle()
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

async function getRegionDestination(region: string): Promise<{ botToken: string; chatId: string } | null> {
  const cleanRegion = region.trim()
  if (!cleanRegion) {
    await recordAdminWarning('Telegram fuel report skipped because one or more branches have no region assigned.')
    return null
  }

  const destination = await getEncryptedRegionDestination(cleanRegion)
  if (!destination) {
    await recordAdminWarning(`Telegram fuel report skipped for ${cleanRegion}. Configure bot token and chat ID for ${cleanRegion}.`)
    return null
  }

  return destination
}

async function sendTelegram(botToken: string, chatId: string, text: string) {
  if (!botToken) throw new Error('Telegram bot token is not configured')
  if (!chatId) throw new Error('Telegram chat ID is not configured')

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Telegram API error ${response.status}: ${body.slice(0, 300)}`)
  }
}

function chunkReport(header: string, lines: string[]): string[] {
  const chunks: string[] = []
  let current = header

  for (const line of lines) {
    const next = `${current}\n${line}`
    if (next.length > 3600) {
      chunks.push(current)
      current = `${header}\n${line}`
    } else {
      current = next
    }
  }

  chunks.push(current)
  return chunks
}

function reportTone(title: string): string {
  const normalized = title.toLowerCase()
  if (normalized.includes('daily')) return 'End-of-day generator runtime and fuel usage by branch.'
  if (normalized.includes('weekly')) return 'Weekly generator runtime and fuel usage by branch.'
  if (normalized.includes('monthly')) return 'Monthly generator runtime and fuel usage by branch.'
  return 'Generator runtime and fuel usage by branch.'
}

function reportPeriodWord(title: string): string {
  const normalized = title.toLowerCase()
  if (normalized.includes('daily')) return 'TODAY'
  if (normalized.includes('weekly')) return 'THIS WEEK'
  if (normalized.includes('monthly')) return 'THIS MONTH'
  return 'THIS PERIOD'
}

async function buildAndSendReport(args: {
  botToken: string
  chatId: string
  region: string
  branches: BranchRow[]
  title: string
  label: string
  start: string
  end: string
}) {
  const reportStart = kampalaDateKeyToUtc(args.start)
  const reportEnd = kampalaDateKeyToUtc(args.end)
  const effectiveReportEnd = new Date(Math.min(reportEnd.getTime(), Date.now()))
  const branchIds = new Set(args.branches.map((branch) => branch.id))

  const { data: fuelRows, error: fuelError } = await supabase
    .from('fuel_refills')
    .select('branch_id, litres, cost')
    .gte('refill_date', args.start)
    .lt('refill_date', args.end)

  if (fuelError) throw fuelError

  const { data: powerRows, error: powerError } = await supabase
    .from('power_sessions')
    .select('branch_id, started_at, ended_at')
    .lt('started_at', reportEnd.toISOString())
    .or(`ended_at.is.null,ended_at.gte.${reportStart.toISOString()}`)

  if (powerError) throw powerError

  const fuelTotals = new Map<string, { litres: number; cost: number; records: number }>()
  for (const row of ((fuelRows as FuelRow[] | null) ?? [])) {
    if (!branchIds.has(row.branch_id)) continue
    const current = fuelTotals.get(row.branch_id) ?? { litres: 0, cost: 0, records: 0 }
    current.litres += numberValue(row.litres)
    current.cost += numberValue(row.cost)
    current.records += 1
    fuelTotals.set(row.branch_id, current)
  }

  const generatorTotals = new Map<string, { minutes: number; records: number }>()
  for (const row of ((powerRows as PowerRow[] | null) ?? [])) {
    if (!branchIds.has(row.branch_id)) continue
    const startedAt = new Date(row.started_at)
    const endedAt = row.ended_at ? new Date(row.ended_at) : effectiveReportEnd
    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) continue

    const overlapStart = new Date(Math.max(startedAt.getTime(), reportStart.getTime()))
    const overlapEnd = new Date(Math.min(endedAt.getTime(), effectiveReportEnd.getTime()))
    const minutes = Math.max(0, Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 60000))
    if (minutes <= 0) continue

    const current = generatorTotals.get(row.branch_id) ?? { minutes: 0, records: 0 }
    current.minutes += minutes
    current.records += 1
    generatorTotals.set(row.branch_id, current)
  }

  const fuelOverall = Array.from(fuelTotals.values()).reduce(
    (sum, item) => ({
      litres: sum.litres + item.litres,
      cost: sum.cost + item.cost,
      records: sum.records + item.records,
    }),
    { litres: 0, cost: 0, records: 0 },
  )
  const generatorOverall = Array.from(generatorTotals.values()).reduce(
    (sum, item) => ({
      minutes: sum.minutes + item.minutes,
      records: sum.records + item.records,
    }),
    { minutes: 0, records: 0 },
  )
  const periodWord = reportPeriodWord(args.title)

  const header = [
    `📊 <b>${escapeHtml(args.title.toUpperCase())}</b>`,
    `<i>${escapeHtml(reportTone(args.title))}</i>`,
    '',
    `<b>REGION:</b> ${escapeHtml(args.region || 'Unassigned Region')}`,
    `<b>DATE:</b> ${formatDateSlash(args.start)}`,
    args.start !== shiftDateKey(args.end, -1) ? `<b>PERIOD:</b> ${escapeHtml(args.label)}` : null,
    '',
    '<b>REGION TOTAL</b>',
    `• <b>Generator time:</b> ${generatorTime(generatorOverall.minutes)}`,
    `• <b>Fuel used:</b> ${money(fuelOverall.cost)}`,
    `• <b>Fuel litres:</b> ${litres(fuelOverall.litres)}`,
    '',
    '<b>BRANCH REPORT</b>',
  ].filter(Boolean).join('\n')

  const lines = args.branches.map((branch) => {
    const fuel = fuelTotals.get(branch.id) ?? { litres: 0, cost: 0, records: 0 }
    const generator = generatorTotals.get(branch.id) ?? { minutes: 0, records: 0 }
    return `• <b>${escapeHtml(branch.name.toUpperCase())}</b> - ${generatorTime(generator.minutes)} ON GEN ${periodWord}, FUEL USED ${periodWord} ${money(fuel.cost)}`
  })

  for (const message of chunkReport(header, lines)) {
    await sendTelegram(args.botToken, args.chatId, message)
  }

  return {
    generator_minutes: generatorOverall.minutes,
    generator_sessions: generatorOverall.records,
    cost: fuelOverall.cost,
    litres: fuelOverall.litres,
    fuel_records: fuelOverall.records,
  }
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

  const body = req.headers.get('content-length') === '0' ? {} : await req.json().catch(() => ({}))
  const mode = (body.mode ?? 'auto') as ReportMode
  const todayKey = typeof body.date === 'string' ? body.date : dateOnlyKampala(new Date())
  if (!['auto', 'daily', 'weekly', 'monthly'].includes(mode)) throw new Error('Invalid report mode')

  const { data: branches, error: branchError } = await supabase
    .from('branches')
    .select('id, name, region')
    .eq('active', true)
    .order('region', { ascending: true })
    .order('name', { ascending: true })

  if (branchError) throw branchError

  const branchesByRegion = new Map<string, BranchRow[]>()
  for (const branch of ((branches as BranchRow[] | null) ?? [])) {
    const region = branch.region.trim()
    branchesByRegion.set(region, [...(branchesByRegion.get(region) ?? []), branch])
  }

  const results: Record<string, Record<string, unknown>> = {}
  for (const range of reportRanges(mode, todayKey)) {
    results[range.key] = {}
    for (const [region, regionBranches] of branchesByRegion.entries()) {
      const destination = await getRegionDestination(region)
      if (!destination) {
        results[range.key][region || 'Unassigned Region'] = { skipped: true, reason: 'region_not_configured' }
        continue
      }

      results[range.key][region] = await buildAndSendReport({
        botToken: destination.botToken,
        chatId: destination.chatId,
        region,
        branches: regionBranches,
        title: range.title,
        label: range.label,
        start: range.start,
        end: range.end,
      })
    }
  }

  return new Response(JSON.stringify({ ok: true, mode, date: todayKey, results, sent_at: new Date().toISOString() }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
