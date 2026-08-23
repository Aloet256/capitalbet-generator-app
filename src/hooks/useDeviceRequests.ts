import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Device } from '../types/database'
import { notifyTelegramEntry } from '../lib/telegram'
import { useRealtimeRefresh } from '../lib/realtime'

type AdminDeviceRequestRow = Omit<Device, 'branches'> & {
  branch_name: string | null
  branch_region: string | null
  branch_code: string | null
  access_pin: string | null
}

function mapAdminDeviceRequest(row: AdminDeviceRequestRow): Device {
  return {
    id: row.id,
    device_fingerprint: row.device_fingerprint,
    branch_id: row.branch_id,
    status: row.status,
    access_kind: row.access_kind ?? 'primary',
    access_pin: row.access_pin,
    device_label: row.device_label,
    requested_at: row.requested_at,
    decided_at: row.decided_at,
    decided_by: row.decided_by,
    last_seen_at: row.last_seen_at,
    branches: row.branch_name
      ? {
          id: row.branch_id,
          name: row.branch_name,
          region: row.branch_region ?? '',
          code: row.branch_code,
          active: true,
          created_at: '',
        }
      : undefined,
  }
}

export function useDeviceRequests() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    const { data, error } = await supabase.rpc('fn_get_admin_device_requests')
    if (error) setError(error.message)
    setDevices(((data as AdminDeviceRequestRow[] | null) ?? []).map(mapAdminDeviceRequest))
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
      details: { device_label: device.device_label, access_type: device.access_kind === 'extra_session' ? 'Extra session approved' : 'Admin approval' },
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
