import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Branch, Device, PowerSession, FuelRefill, Service } from '../types/database'
import { daysUntil, startOfMonth, toLocalDateInput } from '../lib/utils'
import { fetchAllSince, fetchAllTable } from '../lib/query'
import { useRealtimeRefresh } from '../lib/realtime'

export interface BranchSummary {
  branch: Branch
  outagesThisMonth: number
  hoursThisMonth: number
  fuelCostThisMonth: number
  fuelLitresThisMonth: number
  nextServiceDate: string | null
  serviceDueSoon: boolean
}

const ADMIN_REALTIME_TABLES = [
  'branches',
  'devices',
  'power_sessions',
  'fuel_refills',
  'services',
  'repairs',
  'dstv_subscriptions',
  'yaka_purchases',
] as const

export function useAdminOverview() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [pendingDevices, setPendingDevices] = useState<Device[]>([])
  const [summaries, setSummaries] = useState<BranchSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)

    const since = toLocalDateInput(startOfMonth())
    const [branchRes, devicesRes, sessionsRes, fuelRes, servicesRes] = await Promise.all([
      supabase.from('branches').select('*').eq('active', true).order('region').order('name'),
      supabase.from('devices').select('*, branches(*)').eq('status', 'pending').order('requested_at'),
      fetchAllSince<PowerSession>('power_sessions', 'session_date', since, 'started_at'),
      fetchAllSince<FuelRefill>('fuel_refills', 'refill_date', since, 'refill_date'),
      fetchAllTable<Service>('services', 'service_date'),
    ])

    const firstError = branchRes.error?.message || devicesRes.error?.message || sessionsRes.error || fuelRes.error || servicesRes.error
    if (firstError) setError(firstError)

    const branchList = (branchRes.data as Branch[]) ?? []
    const sessionList = sessionsRes.data
    const fuelList = fuelRes.data
    const serviceList = servicesRes.data

    const summaryList: BranchSummary[] = branchList.map((b) => {
      const bSessions = sessionList.filter((s) => s.branch_id === b.id)
      const bFuel = fuelList.filter((f) => f.branch_id === b.id)
      const latestService = serviceList.find((s) => s.branch_id === b.id)
      const minutes = bSessions.reduce((sum, s) => {
        if (s.duration_minutes !== null) return sum + Number(s.duration_minutes)
        if (s.is_ongoing) return sum + Math.max(0, (Date.now() - new Date(s.started_at).getTime()) / 60000)
        return sum
      }, 0)
      const serviceDays = latestService ? daysUntil(latestService.next_service_date) : null

      return {
        branch: b,
        outagesThisMonth: bSessions.length,
        hoursThisMonth: minutes / 60,
        fuelCostThisMonth: bFuel.reduce((sum, f) => sum + Number(f.cost), 0),
        fuelLitresThisMonth: bFuel.reduce((sum, f) => sum + Number(f.litres), 0),
        nextServiceDate: latestService?.next_service_date ?? null,
        serviceDueSoon: serviceDays !== null ? serviceDays <= 5 : false,
      }
    })

    setBranches(branchList)
    setPendingDevices((devicesRes.data as Device[]) ?? [])
    setSummaries(summaryList)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const refreshQuietly = useCallback(() => {
    void load(false)
  }, [load])
  useRealtimeRefresh('admin-overview-live', ADMIN_REALTIME_TABLES, refreshQuietly)

  const totals = {
    outages: summaries.reduce((s, b) => s + b.outagesThisMonth, 0),
    hours: summaries.reduce((s, b) => s + b.hoursThisMonth, 0),
    fuelCost: summaries.reduce((s, b) => s + b.fuelCostThisMonth, 0),
    fuelLitres: summaries.reduce((s, b) => s + b.fuelLitresThisMonth, 0),
    servicesDue: summaries.filter((b) => b.serviceDueSoon).length,
  }

  return { branches, pendingDevices, summaries, totals, loading, error }
}
