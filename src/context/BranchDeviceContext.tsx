import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { recoverFromInvalidHeaderError, supabase } from '../lib/supabase'
import { clearLockedBranchId, describeDevice, getDeviceFingerprint, getLockedBranchId, setLockedBranchId } from '../lib/device'
import { notifyTelegramEntry } from '../lib/telegram'
import type { Branch, DeviceStatus } from '../types/database'

interface BranchDeviceCtx {
  loading: boolean
  branch: Branch | null
  deviceStatus: DeviceStatus | null
  deviceAccessKind: 'primary' | 'extra_session' | null
  fingerprint: string
  selectBranch: (branchId: string) => Promise<{ error?: string }>
  submitAccessPin: (pin: string) => Promise<{ error?: string }>
  refreshStatus: (showLoading?: boolean) => Promise<void>
}

const Ctx = createContext<BranchDeviceCtx | undefined>(undefined)

export function BranchDeviceProvider({ children }: { children: ReactNode }) {
  const fingerprint = getDeviceFingerprint()
  const [loading, setLoading] = useState(true)
  const [branch, setBranch] = useState<Branch | null>(null)
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null)
  const [deviceAccessKind, setDeviceAccessKind] = useState<'primary' | 'extra_session' | null>(null)

  const refreshStatus = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)

    // The server-side device row is authoritative. If localStorage was edited or
    // its branch key was removed, restore the original assignment from Supabase.
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('id, branch_id, status, access_kind, last_seen_at, branches(*)')
      .eq('device_fingerprint', fingerprint)
      .maybeSingle()

    if (deviceError) {
      if (recoverFromInvalidHeaderError(deviceError)) return
      console.error('refreshStatus device lookup failed', deviceError)
      setLoading(false)
      return
    }

    if (device) {
      const assignedBranch = (device as any).branches as Branch | null
      setLockedBranchId(device.branch_id)
      setBranch(assignedBranch ?? null)
      setDeviceStatus(device.status as DeviceStatus)
      setDeviceAccessKind((device.access_kind as 'primary' | 'extra_session' | null) ?? 'primary')
      setLoading(false)

      if (device.status === 'approved') {
        void supabase
          .from('devices')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', device.id)
      }
      return
    }

    // The server-side device row is authoritative. If it is gone after an
    // admin reset, clear the stale local lock so this browser starts fresh.
    if (getLockedBranchId()) clearLockedBranchId()

    setBranch(null)
    setDeviceStatus(null)
    setDeviceAccessKind(null)
    setLoading(false)
  }, [fingerprint])

  useEffect(() => {
    void refreshStatus()
    const id = window.setInterval(() => void refreshStatus(), 20000)
    return () => window.clearInterval(id)
  }, [refreshStatus])

  const selectBranch = useCallback(
    async (branchId: string): Promise<{ error?: string }> => {
      setLoading(true)

      const { data: existing, error: existingError } = await supabase
        .from('devices')
        .select('branch_id, status')
        .eq('device_fingerprint', fingerprint)
        .maybeSingle()

      if (existingError) {
        if (recoverFromInvalidHeaderError(existingError)) return {}
        setLoading(false)
        return { error: existingError.message }
      }

      if (existing) {
        setLockedBranchId(existing.branch_id)
        await refreshStatus(true)
        if (existing.branch_id !== branchId) {
          return { error: 'This computer is already permanently assigned to another branch. Contact an administrator.' }
        }
        return {}
      }

      // The server is authoritative. The RPC allows a first device to request
      // approval normally and creates a one-time PIN request for extra branch sessions.
      const deviceLabel = describeDevice()
      const { data, error } = await supabase.rpc('fn_request_branch_device', {
        p_branch_id: branchId,
        p_device_label: deviceLabel,
      })

      if (error) {
        if (recoverFromInvalidHeaderError(error)) return {}
        await refreshStatus(true)
        return { error: error.message }
      }

      setLockedBranchId(branchId)
      const requestedKind = Array.isArray(data) ? data[0]?.access_kind : null
      void notifyTelegramEntry({
        type: 'device_request',
        branchId,
        details: {
          device_label: deviceLabel,
          requested_at: new Date().toLocaleString(),
          access_type: requestedKind === 'extra_session' ? 'Extra session PIN request' : 'Admin approval',
        },
      })
      await refreshStatus(true)
      return {}
    },
    [fingerprint, refreshStatus]
  )

  const submitAccessPin = useCallback(
    async (pin: string): Promise<{ error?: string }> => {
      setLoading(true)
      const { error } = await supabase.rpc('fn_submit_branch_access_pin', { p_pin: pin })

      if (error) {
        if (recoverFromInvalidHeaderError(error)) return {}
        setLoading(false)
        return { error: error.message }
      }

      void notifyTelegramEntry({
        type: 'device_approved',
        branchId: branch?.id,
        details: {
          device_label: describeDevice(),
          access_type: 'Extra session PIN accepted',
        },
      })
      await refreshStatus(true)
      return {}
    },
    [branch?.id, refreshStatus]
  )

  return (
    <Ctx.Provider value={{ loading, branch, deviceStatus, deviceAccessKind, fingerprint, selectBranch, submitAccessPin, refreshStatus }}>
      {children}
    </Ctx.Provider>
  )
}

export function useBranchDevice() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useBranchDevice must be used within BranchDeviceProvider')
  return ctx
}
