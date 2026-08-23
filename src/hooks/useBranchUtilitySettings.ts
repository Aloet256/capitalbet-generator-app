import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { BranchUtilitySettings } from '../types/database'
import { useRealtimeRefresh } from '../lib/realtime'

export function useBranchUtilitySettings(branchId: string | null) {
  const [settings, setSettings] = useState<BranchUtilitySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showLoading = true) => {
    if (!branchId) {
      setSettings(null)
      setLoading(false)
      return
    }

    if (showLoading) setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('branch_utility_settings')
      .select('*')
      .eq('branch_id', branchId)
      .maybeSingle()

    if (error) {
      setSettings(null)
      setError(error.message)
    } else {
      setSettings((data as BranchUtilitySettings | null) ?? null)
    }
    setLoading(false)
  }, [branchId])

  useEffect(() => {
    void load()
  }, [load])

  const refreshQuietly = useCallback(() => {
    void load(false)
  }, [load])

  useRealtimeRefresh(
    `branch-utility-settings-${branchId ?? 'none'}`,
    ['branch_utility_settings'],
    refreshQuietly,
    Boolean(branchId)
  )

  const saveSettings = async (input: {
    dstv_smart_card_number?: string | null
    yaka_meter_number?: string | null
  }) => {
    if (!branchId) return { error: 'No branch selected' }

    const next = {
      branch_id: branchId,
      dstv_smart_card_number:
        input.dstv_smart_card_number !== undefined
          ? input.dstv_smart_card_number
          : settings?.dstv_smart_card_number ?? null,
      yaka_meter_number:
        input.yaka_meter_number !== undefined
          ? input.yaka_meter_number
          : settings?.yaka_meter_number ?? null,
    }

    const { error } = await supabase
      .from('branch_utility_settings')
      .upsert(next, { onConflict: 'branch_id' })

    if (error) return { error: error.message }
    await load(false)
    return {}
  }

  return { settings, loading, error, saveSettings, reload: load }
}
