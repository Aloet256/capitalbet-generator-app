import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { recoverFromInvalidHeaderError, supabase } from '../lib/supabase'
import { clearLockedBranchId, describeDevice, getDeviceFingerprint, getLockedBranchId, setLockedBranchId } from '../lib/device'
import { notifyTelegramEntry } from '../lib/telegram'
import type { Branch, DeviceStatus } from '../types/database'

interface BranchDeviceCtx {
  loading: boolean
  branch: Branch | null
  deviceStatus: DeviceStatus | null
  fingerprint: string
  selectBranch: (branchId: string, accessPin?: string) => Promise<{ error?: string }>
  refreshStatus: (showLoading?: boolean) => Promise<void>
}

const Ctx = createContext<BranchDeviceCtx | undefined>(undefined)

export function BranchDeviceProvider({ children }: { children: ReactNode }) {
  const fingerprint = getDeviceFingerprint()
  const [loading, setLoading] = useState(true)
  const [branch, setBranch] = useState<Branch | null>(null)
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null)

  const refreshStatus = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)

    // The server-side device row is authoritative. If localStorage was edited or
    // its branch key was removed, restore the original assignment from Supabase.
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('id, branch_id, status, last_seen_at, branches(*)')
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
    setLoading(false)
  }, [fingerprint])

  useEffect(() => {
    void refreshStatus()
    const id = window.setInterval(() => void refreshStatus(), 20000)
    return () => window.clearInterval(id)
  }, [refreshStatus])

  const selectBranch = useCallback(
    async (branchId: string, accessPin = ''): Promise<{ error?: string }> => {
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
      // approval normally and allows extra branch sessions only with the admin PIN.
      const deviceLabel = describeDevice()
      const { data, error } = await supabase.rpc('fn_request_branch_device', {
        p_branch_id: branchId,
        p_device_label: deviceLabel,
        p_access_pin: accessPin,
      })

      if (error) {
        if (recoverFromInvalidHeaderError(error)) return {}
        await refreshStatus(true)
        return { error: error.message }
      }

      setLockedBranchId(branchId)
      const requestedStatus = Array.isArray(data) ? data[0]?.device_status : null
      void notifyTelegramEntry({
        type: requestedStatus === 'approved' ? 'device_approved' : 'device_request',
        branchId,
        details: {
          device_label: deviceLabel,
          requested_at: new Date().toLocaleString(),
          access_type: requestedStatus === 'approved' ? 'PIN extra session' : 'Admin approval',
        },
      })
      await refreshStatus(true)
      return {}
    },
    [fingerprint, refreshStatus]
  )

  return (
    <Ctx.Provider value={{ loading, branch, deviceStatus, fingerprint, selectBranch, refreshStatus }}>
      {children}
    </Ctx.Provider>
  )
}

export function useBranchDevice() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useBranchDevice must be used within BranchDeviceProvider')
  return ctx
}
