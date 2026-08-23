import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Repair, RepairCategory } from '../types/database'
import { fetchAllByBranch } from '../lib/query'
import { notifyTelegramEntry } from '../lib/telegram'
import { deleteBranchEntry } from '../lib/deleteEntry'
import { useRealtimeRefresh } from '../lib/realtime'

export const REPAIR_CATEGORIES: RepairCategory[] = [
  'Generator',
  'TV',
  'Electricity',
  'Printer',
  'Computer',
]

export function useRepairs(branchId: string | null) {
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showLoading = true) => {
    if (!branchId) {
      setRepairs([])
      setLoading(false)
      return
    }
    if (showLoading) setLoading(true)
    setError(null)
    const res = await fetchAllByBranch<Repair>('repairs', branchId, 'repair_date')
    if (res.error) setError(res.error)
    else setRepairs(res.data)
    setLoading(false)
  }, [branchId])

  useEffect(() => {
    void load()
  }, [load])

  const refreshQuietly = useCallback(() => {
    void load(false)
  }, [load])
  useRealtimeRefresh(`repairs-${branchId ?? 'none'}`, ['repairs'], refreshQuietly, Boolean(branchId))

  const addRepair = async (input: Omit<Repair, 'id' | 'branch_id' | 'created_at' | 'created_by_device'>) => {
    if (!branchId) return { error: 'No branch selected' }
    if (!input.description.trim()) return { error: 'Description is required.' }
    if (input.cost !== null && input.cost < 0) return { error: 'Repair cost cannot be negative.' }
    const { error } = await supabase.from('repairs').insert({ ...input, branch_id: branchId })
    if (error) return { error: error.message }
    void notifyTelegramEntry({ type: 'repair_record', branchId, details: input })
    await load()
    return {}
  }

  const deleteRepair = async (id: string, password: string) => {
    const res = await deleteBranchEntry('repairs', id, password)
    if (res.error) return res
    await load()
    return {}
  }

  return { repairs, loading, error, addRepair, deleteRepair, reload: load }
}
