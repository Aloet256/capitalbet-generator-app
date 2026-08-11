import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Device } from '../types/database'
import { notifyTelegramEntry } from '../lib/telegram'
import { useRealtimeRefresh } from '../lib/realtime'

export function useDeviceRequests() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('devices')
      .select('*, branches(*)')
      .order('requested_at', { ascending: false })
    if (error) setError(error.message)
    setDevices((data as Device[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const refreshQuietly = useCallback(() => {
    void load(false)
  }, [load])
  useRealtimeRefresh('device-requests-live', ['devices'], refreshQuietly)

  const approve = async (device: Device, adminId: string) => {
    const { error } = await supabase
      .from('devices')
      .update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: adminId })
      .eq('id', device.id)
      .eq('status', 'pending')
    if (error) return { error: error.message }
    void notifyTelegramEntry({
      type: 'device_approved',
      branchId: device.branch_id,
      details: { device_label: device.device_label },
    })
    await load()
    return {}
  }

  const revoke = async (device: Device, adminId: string) => {
    const { error } = await supabase
      .from('devices')
      .update({ status: 'revoked', decided_at: new Date().toISOString(), decided_by: adminId })
      .eq('id', device.id)
    if (error) return { error: error.message }
    void notifyTelegramEntry({
      type: 'device_revoked',
      branchId: device.branch_id,
      details: { device_label: device.device_label },
    })
    await load()
    return {}
  }

  const restore = async (device: Device, adminId: string) => {
    const { error } = await supabase
      .from('devices')
      .update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: adminId })
      .eq('id', device.id)
      .eq('status', 'revoked')
    if (error) return { error: error.message }
    void notifyTelegramEntry({
      type: 'device_restored',
      branchId: device.branch_id,
      details: { device_label: device.device_label },
    })
    await load()
    return {}
  }

  return { devices, loading, error, approve, revoke, restore, reload: load }
}
