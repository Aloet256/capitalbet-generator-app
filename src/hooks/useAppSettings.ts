import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AppSettings } from '../types/database'
import { coerceTextSetting, DEFAULT_APP_SETTINGS } from '../lib/appSettings'
import { coerceDstvPackagePrices } from '../lib/dstv'

function coerceSettingValue(key: keyof AppSettings, value: unknown): AppSettings[keyof AppSettings] {
  const defaultValue = DEFAULT_APP_SETTINGS[key]
  if (typeof defaultValue === 'number') return Number(value)
  if (key === 'dstv_package_prices') return coerceDstvPackagePrices(value)
  return coerceTextSetting(value)
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.from('app_settings').select('key, value')
    if (error) {
      setError(error.message)
    } else if (data) {
      const merged = { ...DEFAULT_APP_SETTINGS }
      for (const row of data) {
        if (row.key in merged) {
          const key = row.key as keyof AppSettings
          const writable = merged as Record<keyof AppSettings, unknown>
          writable[key] = coerceSettingValue(key, row.value)
        }
      }
      setSettings(merged)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const updateSetting = async (key: keyof AppSettings, value: unknown) => {
    const { error } = await supabase.from('app_settings').upsert({ key, value })
    if (error) return { error: error.message }
    return {}
  }

  return { settings, loading, error, updateSetting, reload: load }
}
