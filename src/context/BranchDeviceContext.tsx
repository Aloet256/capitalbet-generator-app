import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { recoverFromInvalidHeaderError, supabase } from '../lib/supabase'
import { describeDevice, getDeviceFingerprint, getLockedBranchId, setLockedBranchId } from '../lib/device'
import { notifyTelegramEntry } from '../lib/telegram'
import type { Branch, DeviceStatus } from '../types/database'

interface BranchDeviceCtx {
  loading: boolean
  branch: Branch | null
  deviceStatus: DeviceStatus | null
  fingerprint: string
  selectBranch: (branchId: string) => Promise<{ error?: string }>
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

    // A local lock may exist between the first click and a successful insert.
    // Preserve that branch so the user can retry only the same assignment.
    const lockedId = getLockedBranchId()
    if (lockedId) {
      const { data: branchRows } = await supabase.rpc('get_branch_selection_list')
      const row = (branchRows ?? []).find((item: any) => item.branch_id === lockedId)
      setBranch(
        row
          ? ({
              id: row.branch_id,
              name: row.name,
              region: row.region,
              code: row.code ?? null,
              telegram_chat_id: null,
              active: true,
              created_at: '',
            } as Branch)
          : null
      )
      setDeviceStatus(null)
      setLoading(false)
      return
    }

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

      // The server is authoritative. We persist the branch locally only after
      // the pending request succeeds, so a race with another device does not
      // trap this computer on a branch it never actually acquired.
      const deviceLabel = describeDevice()
      const { error } = await supabase.from('devices').insert({
        device_fingerprint: fingerprint,
        branch_id: branchId,
        device_label: deviceLabel,
        status: 'pending',
      })

      if (error) {
        if (recoverFromInvalidHeaderError(error)) return {}
        await refreshStatus(true)
        if (error.code === '23505') {
          return { error: 'That branch is already assigned to another computer. Choose an available branch.' }
        }
        return { error: error.message }
      }

      setLockedBranchId(branchId)
      void notifyTelegramEntry({
        type: 'device_request',
        branchId,
        details: {
          device_label: deviceLabel,
          requested_at: new Date().toLocaleString(),
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
