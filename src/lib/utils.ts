import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatMinutes(mins: number | null | undefined): string {
  if (mins === null || mins === undefined) return '—'
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

export function formatUGX(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—'
  return `UGX ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount)}`
}

export function formatCurrencyInput(value: string | number | null | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function parseCurrencyInput(value: string | number | null | undefined): number {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits ? Number(digits) : 0
}

export function formatDate(d: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('en-GB', opts ?? { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr)
  const today = new Date()
  target.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

export function toLocalDateInput(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function startOfWeek(): Date {
  const d = startOfToday()
  const day = d.getDay() === 0 ? 7 : d.getDay() // ISO week, Monday start
  d.setDate(d.getDate() - (day - 1))
  return d
}

export function startOfMonth(): Date {
  const d = startOfToday()
  d.setDate(1)
  return d
}

export function startOfYear(): Date {
  const d = startOfToday()
  d.setMonth(0, 1)
  return d
}
