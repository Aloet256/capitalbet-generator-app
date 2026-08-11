import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Service } from '../types/database'
import { fetchAllByBranch } from '../lib/query'
import { notifyTelegramEntry } from '../lib/telegram'
import { deleteBranchEntry } from '../lib/deleteEntry'
import { useRealtimeRefresh } from '../lib/realtime'
import { toLocalDateInput } from '../lib/utils'

type ServiceInput = Omit<
  Service,
  'id' | 'branch_id' | 'created_at' | 'created_by_device' | 'service_date' | 'next_service_date' | 'reminder_sent'
> & {
  service_date?: string
}

export function useServices(branchId: string | null) {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showLoading = true) => {
    if (!branchId) {
      setServices([])
      setLoading(false)
      return
    }
    if (showLoading) setLoading(true)
    setError(null)
    const res = await fetchAllByBranch<Service>('services', branchId, 'service_date')
    if (res.error) setError(res.error)
    else setServices(res.data)
    setLoading(false)
  }, [branchId])

  useEffect(() => {
    void load()
  }, [load])

  const refreshQuietly = useCallback(() => {
    void load(false)
  }, [load])
  useRealtimeRefresh(`services-${branchId ?? 'none'}`, ['services'], refreshQuietly, Boolean(branchId))

  const addService = async (input: ServiceInput) => {
    if (!branchId) return { error: 'No branch selected' }
    if (!input.technician_name.trim() || !input.technician_phone.trim() || !input.work_done.trim()) {
      return { error: 'Technician name, phone and work done are required.' }
    }
    if (input.cost !== null && Number(input.cost) < 0) return { error: 'Service cost cannot be negative.' }
    const serviceRecord = { ...input, service_date: input.service_date || toLocalDateInput() }
    const { error } = await supabase.from('services').insert({ ...serviceRecord, branch_id: branchId })
    if (error) return { error: error.message }
    void notifyTelegramEntry({ type: 'service_record', branchId, details: serviceRecord })
    await load()
    return {}
  }

  const latest = services[0] ?? null

  const deleteService = async (id: string, password: string) => {
    const res = await deleteBranchEntry('services', id, password)
    if (res.error) return res
    await load()
    return {}
  }

  return { services, latest, loading, error, addService, deleteService, reload: load }
}
