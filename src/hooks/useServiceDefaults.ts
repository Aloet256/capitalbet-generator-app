import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  coerceTextSetting,
  DEFAULT_SERVICE_SETTINGS,
  SERVICE_DEFAULT_SETTING_KEYS,
  type ServiceDefaultSettingKey,
  type ServiceDefaults,
} from '../lib/appSettings'

type SettingRow = {
  key: string
  value: unknown
}

export function useServiceDefaults() {
  const [defaults, setDefaults] = useState<ServiceDefaults>(DEFAULT_SERVICE_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', [...SERVICE_DEFAULT_SETTING_KEYS])

    if (error) {
      setDefaults(DEFAULT_SERVICE_SETTINGS)
      setError(error.message)
      setLoading(false)
      return
    }

    const merged = { ...DEFAULT_SERVICE_SETTINGS }
    for (const row of (data as SettingRow[] | null) ?? []) {
      if (SERVICE_DEFAULT_SETTING_KEYS.includes(row.key as ServiceDefaultSettingKey)) {
        const key = row.key as ServiceDefaultSettingKey
        merged[key] = coerceTextSetting(row.value)
      }
    }

    setDefaults(merged)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { defaults, loading, error, reload: load }
}
