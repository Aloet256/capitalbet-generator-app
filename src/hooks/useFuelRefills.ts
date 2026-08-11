import { useCallback, useEffect, useState } from 'react'
import type { FuelRefill } from '../types/database'
import { supabase } from '../lib/supabase'
import { fetchAllByBranch } from '../lib/query'
import { notifyTelegramEntry } from '../lib/telegram'
import { deleteBranchEntry } from '../lib/deleteEntry'
import { useRealtimeRefresh } from '../lib/realtime'

export function useFuelRefills(branchId: string | null) {
  const [refills, setRefills] = useState<FuelRefill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showLoading = true) => {
    if (!branchId) {
      setRefills([])
      setLoading(false)
      return
    }
    if (showLoading) setLoading(true)
    setError(null)
    const res = await fetchAllByBranch<FuelRefill>('fuel_refills', branchId, 'refill_date')
    if (res.error) setError(res.error)
    else setRefills(res.data)
    setLoading(false)
  }, [branchId])

  useEffect(() => {
    void load()
  }, [load])

  const refreshQuietly = useCallback(() => {
    void load(false)
  }, [load])
  useRealtimeRefresh(`fuel-refills-${branchId ?? 'none'}`, ['fuel_refills'], refreshQuietly, Boolean(branchId))

  const addRefill = async (input: Omit<FuelRefill, 'id' | 'branch_id' | 'created_at' | 'created_by_device'>) => {
    if (!branchId) return { error: 'No branch selected' }
    if (input.cost <= 0 || input.litres <= 0) return { error: 'Cost and litres must be greater than zero.' }
    if (!input.authorized_by.trim()) return { error: 'Authorized by is required.' }
    const { error } = await supabase.from('fuel_refills').insert({ ...input, branch_id: branchId })
    if (error) return { error: error.message }
    void notifyTelegramEntry({ type: 'fuel_refill', branchId, details: input })
    await load()
    return {}
  }

  const deleteRefill = async (id: string, password: string) => {
    const res = await deleteBranchEntry('fuel_refills', id, password)
    if (res.error) return res
    await load()
    return {}
  }

  return { refills, loading, error, addRefill, deleteRefill, reload: load }
}
