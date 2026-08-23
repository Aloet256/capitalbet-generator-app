import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FuelRefill, PowerSession } from '../types/database'
import { fetchAllByBranch } from '../lib/query'
import { startOfMonth, startOfToday, startOfWeek, startOfYear } from '../lib/utils'
import { useRealtimeRefresh } from '../lib/realtime'

export interface PeriodStat {
  hours: number
  outages: number
  fuelCost: number
  fuelLitres: number
  fuelRefills: number
}

export interface HourlyPowerStat {
  hour: string
  outages: number
  minutes: number
}

export interface DailyPowerStat {
  label: string
  date: string
  outages: number
  minutes: number
  hourly: HourlyPowerStat[]
  sessions: PowerSession[]
}

function effectiveEnd(session: PowerSession, now: Date): Date {
  return session.ended_at ? new Date(session.ended_at) : now
}

function overlapMinutes(session: PowerSession, rangeStart: Date, rangeEnd: Date, now: Date): number {
  const start = new Date(session.started_at)
  const end = effectiveEnd(session, now)
  const overlapStart = Math.max(start.getTime(), rangeStart.getTime())
  const overlapEnd = Math.min(end.getTime(), rangeEnd.getTime())
  return Math.max(0, (overlapEnd - overlapStart) / 60000)
}

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function useDashboardStats(branchId: string | null) {
  const [sessions, setSessions] = useState<PowerSession[]>([])
  const [refills, setRefills] = useState<FuelRefill[]>([])
  const [loading, setLoading] = useState(true)
  const [nowTick, setNowTick] = useState(() => new Date())

  const load = useCallback(async (showLoading = true) => {
    if (!branchId) {
      setSessions([])
      setRefills([])
      setLoading(false)
      return
    }
    if (showLoading) setLoading(true)
    const [sRes, fRes] = await Promise.all([
      fetchAllByBranch<PowerSession>('power_sessions', branchId, 'started_at'),
      fetchAllByBranch<FuelRefill>('fuel_refills', branchId, 'refill_date'),
    ])
    setSessions(sRes.data)
    setRefills(fRes.data)
    setLoading(false)
  }, [branchId])

  useEffect(() => {
    void load()
  }, [load])

  const refreshQuietly = useCallback(() => {
    void load(false)
  }, [load])
  useRealtimeRefresh(
    `dashboard-stats-${branchId ?? 'none'}`,
    ['power_sessions', 'fuel_refills'],
    refreshQuietly,
    Boolean(branchId)
  )

  const ongoing = sessions.find((s) => s.is_ongoing) ?? null

  useEffect(() => {
    if (!ongoing) return
    const id = window.setInterval(() => setNowTick(new Date()), 60000)
    return () => window.clearInterval(id)
  }, [ongoing])

  const compute = (since: Date): PeriodStat => {
    const now = nowTick
    const minutes = sessions.reduce((sum, s) => sum + overlapMinutes(s, since, now, now), 0)
    const outages = sessions.filter((s) => {
      const start = new Date(s.started_at)
      return start >= since && start <= now
    }).length
    const refillsInRange = refills.filter((r) => {
      const d = new Date(`${r.refill_date}T00:00:00`)
      return d >= since && d <= now
    })
    return {
      hours: minutes / 60,
      outages,
      fuelCost: refillsInRange.reduce((sum, r) => sum + Number(r.cost), 0),
      fuelLitres: refillsInRange.reduce((sum, r) => sum + Number(r.litres), 0),
      fuelRefills: refillsInRange.length,
    }
  }

  const stats = useMemo(
    () => ({
      today: compute(startOfToday()),
      week: compute(startOfWeek()),
      month: compute(startOfMonth()),
      year: compute(startOfYear()),
    }),
    [sessions, refills, nowTick]
  )

  const dailyBreakdown = useMemo<DailyPowerStat[]>(() => {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const weekStart = startOfWeek()
    return labels.map((label, index) => {
      const dayStart = new Date(weekStart)
      dayStart.setDate(dayStart.getDate() + index)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)

      const touchingSessions = sessions.filter((session) => {
        const start = new Date(session.started_at)
        const end = effectiveEnd(session, nowTick)
        return start < dayEnd && end > dayStart
      })
      const startedSessions = sessions.filter((session) => {
        const start = new Date(session.started_at)
        return start >= dayStart && start < dayEnd
      })

      const hourly = Array.from({ length: 24 }, (_, hour) => {
        const hourStart = new Date(dayStart)
        hourStart.setHours(hour, 0, 0, 0)
        const hourEnd = new Date(hourStart)
        hourEnd.setHours(hour + 1)
        const minutes = touchingSessions.reduce(
          (sum, session) => sum + overlapMinutes(session, hourStart, hourEnd, nowTick),
          0
        )
        const outages = startedSessions.filter((session) => new Date(session.started_at).getHours() === hour).length
        return { hour: `${String(hour).padStart(2, '0')}:00`, outages, minutes }
      })

      return {
        label,
        date: toLocalDateKey(dayStart),
        outages: startedSessions.length,
        minutes: touchingSessions.reduce((sum, session) => sum + overlapMinutes(session, dayStart, dayEnd, nowTick), 0),
        hourly,
        sessions: touchingSessions,
      }
    })
  }, [sessions, nowTick])

  const weeklyChart = useMemo(
    () => dailyBreakdown.map((d) => ({ label: d.label, hours: d.minutes / 60, outages: d.outages })),
    [dailyBreakdown]
  )

  const monthlyFuelChart = useMemo(() => {
    const months: { label: string; cost: number }[] = []
    const now = nowTick
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      const cost = refills
        .filter((r) => {
          const rd = new Date(`${r.refill_date}T00:00:00`)
          return rd >= d && rd < next
        })
        .reduce((sum, r) => sum + Number(r.cost), 0)
      months.push({ label: d.toLocaleDateString('en-GB', { month: 'short' }), cost })
    }
    return months
  }, [refills, nowTick])

  return { stats, sessions, refills, weeklyChart, dailyBreakdown, monthlyFuelChart, loading, ongoing }
}
