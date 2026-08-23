import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PowerSession } from '../types/database'
import { fetchAllByBranch } from '../lib/query'
import { notifyTelegramEntry } from '../lib/telegram'
import { deleteBranchEntry } from '../lib/deleteEntry'
import { useRealtimeRefresh } from '../lib/realtime'

export function usePowerSessions(branchId: string | null) {
  const [sessions, setSessions] = useState<PowerSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showLoading = true) => {
    if (!branchId) {
      setSessions([])
      setLoading(false)
      return
    }
    if (showLoading) setLoading(true)
    setError(null)
    const res = await fetchAllByBranch<PowerSession>('power_sessions', branchId, 'started_at')
    if (res.error) setError(res.error)
    else setSessions(res.data)
    setLoading(false)
  }, [branchId])

  useEffect(() => {
    void load()
  }, [load])

  const refreshQuietly = useCallback(() => {
    void load(false)
  }, [load])
  useRealtimeRefresh(`power-sessions-${branchId ?? 'none'}`, ['power_sessions'], refreshQuietly, Boolean(branchId))

  const ongoing = sessions.find((s) => s.is_ongoing) ?? null

  const startOutage = async (notes?: string) => {
    if (!branchId) return { error: 'No branch selected' }
    if (ongoing) return { error: 'There is already an ongoing outage for this branch.' }
    const startedAt = new Date().toISOString()
    const { error } = await supabase.from('power_sessions').insert({
      branch_id: branchId,
      started_at: startedAt,
      notes: notes?.trim() || null,
    })
    if (error) return { error: error.message }
    void notifyTelegramEntry({
      type: 'power_outage_started',
      branchId,
      details: {
        started_at: startedAt,
        notes: notes?.trim() || null,
      },
    })
    await load()
    return {}
  }

  const stopOutage = async () => {
    if (!ongoing) return { error: 'No ongoing outage to stop' }
    const endedAt = new Date().toISOString()
    const { error } = await supabase
      .from('power_sessions')
      .update({ ended_at: endedAt })
      .eq('id', ongoing.id)
      .eq('is_ongoing', true)
    if (error) return { error: error.message }
    void notifyTelegramEntry({
      type: 'power_outage_stopped',
      branchId: ongoing.branch_id,
      details: {
        started_at: ongoing.started_at,
        ended_at: endedAt,
        duration_minutes: (new Date(endedAt).getTime() - new Date(ongoing.started_at).getTime()) / 60000,
      },
    })
    await load()
    return {}
  }

  const deleteSession = async (id: string, password: string) => {
    const res = await deleteBranchEntry('power_sessions', id, password)
    if (res.error) return res
    await load()
    return {}
  }

  return { sessions, ongoing, loading, error, startOutage, stopOutage, deleteSession, reload: load }
}
