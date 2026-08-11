import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DstvSubscription } from '../types/database'
import { fetchAllByBranch } from '../lib/query'
import { notifyTelegramEntry } from '../lib/telegram'
import { deleteBranchEntry } from '../lib/deleteEntry'
import { useRealtimeRefresh } from '../lib/realtime'

export function useDstv(branchId: string | null) {
  const [subscriptions, setSubscriptions] = useState<DstvSubscription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showLoading = true) => {
    if (!branchId) {
      setSubscriptions([])
      setLoading(false)
      return
    }
    if (showLoading) setLoading(true)
    setError(null)
    const res = await fetchAllByBranch<DstvSubscription>('dstv_subscriptions', branchId, 'subscription_date')
    if (res.error) setError(res.error)
    else setSubscriptions(res.data)
    setLoading(false)
  }, [branchId])

  useEffect(() => {
    void load()
  }, [load])

  const refreshQuietly = useCallback(() => {
    void load(false)
  }, [load])
  useRealtimeRefresh(`dstv-${branchId ?? 'none'}`, ['dstv_subscriptions'], refreshQuietly, Boolean(branchId))

  const addSubscription = async (
    input: Omit<DstvSubscription, 'id' | 'branch_id' | 'created_at' | 'created_by_device' | 'renewal_date' | 'reminder_sent'>
  ) => {
    if (!branchId) return { error: 'No branch selected' }
    if (!input.smart_card_number.trim()) return { error: 'Smart card number is required.' }
    if (input.amount <= 0) return { error: 'Amount must be greater than zero.' }
    const { error } = await supabase.from('dstv_subscriptions').insert({ ...input, branch_id: branchId })
    if (error) return { error: error.message }
    void notifyTelegramEntry({ type: 'dstv_subscription', branchId, details: input })
    await load()
    return {}
  }

  const latest = subscriptions[0] ?? null

  const deleteSubscription = async (id: string, password: string) => {
    const res = await deleteBranchEntry('dstv_subscriptions', id, password)
    if (res.error) return res
    await load()
    return {}
  }

  return { subscriptions, latest, loading, error, addSubscription, deleteSubscription, reload: load }
}
