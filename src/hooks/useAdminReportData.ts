import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchAllTable } from '../lib/query'
import { useRealtimeRefresh } from '../lib/realtime'
import type { AdminReportData } from '../lib/reportWorkbook'
import type { Branch, DstvSubscription, FuelRefill, PowerSession, Repair, Service, YakaPurchase } from '../types/database'

const REPORT_TABLES = [
  'branches',
  'power_sessions',
  'fuel_refills',
  'services',
  'repairs',
  'dstv_subscriptions',
  'yaka_purchases',
] as const

const emptyData: AdminReportData = {
  branches: [],
  sessions: [],
  refills: [],
  services: [],
  repairs: [],
  subscriptions: [],
  purchases: [],
}

export function useAdminReportData() {
  const [data, setData] = useState<AdminReportData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)

    const [branchesRes, sessionsRes, refillsRes, servicesRes, repairsRes, subscriptionsRes, purchasesRes] = await Promise.all([
      supabase.from('branches').select('*').eq('active', true).order('region').order('name'),
      fetchAllTable<PowerSession>('power_sessions', 'started_at'),
      fetchAllTable<FuelRefill>('fuel_refills', 'refill_date'),
      fetchAllTable<Service>('services', 'service_date'),
      fetchAllTable<Repair>('repairs', 'repair_date'),
      fetchAllTable<DstvSubscription>('dstv_subscriptions', 'subscription_date'),
      fetchAllTable<YakaPurchase>('yaka_purchases', 'purchase_date'),
    ])

    const firstError =
      branchesRes.error?.message ||
      sessionsRes.error ||
      refillsRes.error ||
      servicesRes.error ||
      repairsRes.error ||
      subscriptionsRes.error ||
      purchasesRes.error

    if (firstError) setError(firstError)

    setData({
      branches: (branchesRes.data as Branch[]) ?? [],
      sessions: sessionsRes.data,
      refills: refillsRes.data,
      services: servicesRes.data,
      repairs: repairsRes.data,
      subscriptions: subscriptionsRes.data,
      purchases: purchasesRes.data,
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const refreshQuietly = useCallback(() => {
    void load(false)
  }, [load])
  useRealtimeRefresh('admin-report-data-live', REPORT_TABLES, refreshQuietly)

  return { data, loading, error, reload: load }
}
