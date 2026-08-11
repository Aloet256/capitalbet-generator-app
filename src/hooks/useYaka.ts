import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { YakaPurchase } from '../types/database'
import { fetchAllByBranch } from '../lib/query'
import { notifyTelegramEntry } from '../lib/telegram'
import { deleteBranchEntry } from '../lib/deleteEntry'
import { useRealtimeRefresh } from '../lib/realtime'

export function useYaka(branchId: string | null) {
  const [purchases, setPurchases] = useState<YakaPurchase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showLoading = true) => {
    if (!branchId) {
      setPurchases([])
      setLoading(false)
      return
    }
    if (showLoading) setLoading(true)
    setError(null)
    const res = await fetchAllByBranch<YakaPurchase>('yaka_purchases', branchId, 'purchase_date')
    if (res.error) setError(res.error)
    else setPurchases(res.data)
    setLoading(false)
  }, [branchId])

  useEffect(() => {
    void load()
  }, [load])

  const refreshQuietly = useCallback(() => {
    void load(false)
  }, [load])
  useRealtimeRefresh(`yaka-${branchId ?? 'none'}`, ['yaka_purchases'], refreshQuietly, Boolean(branchId))

  const addPurchase = async (
    input: Omit<
      YakaPurchase,
      'id' | 'branch_id' | 'created_at' | 'created_by_device' | 'reminder_sent' | 'expected_reload_date'
    >
  ) => {
    if (!branchId) return { error: 'No branch selected' }
    if (!input.meter_number.trim()) return { error: 'Meter number is required.' }
    if (input.units <= 0 || input.amount <= 0) return { error: 'Units and amount must be greater than zero.' }
    const { error } = await supabase.from('yaka_purchases').insert({ ...input, branch_id: branchId })
    if (error) return { error: error.message }
    void notifyTelegramEntry({ type: 'yaka_purchase', branchId, details: input })
    await load()
    return {}
  }

  const latest = purchases[0] ?? null

  const deletePurchase = async (id: string, password: string) => {
    const res = await deleteBranchEntry('yaka_purchases', id, password)
    if (res.error) return res
    await load()
    return {}
  }

  return { purchases, latest, loading, error, addPurchase, deletePurchase, reload: load }
}
