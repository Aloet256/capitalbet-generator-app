import { createClient } from '@supabase/supabase-js'
import { getDeviceFingerprint } from './device'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function isAsciiHeaderValue(value: string) {
  return /^[\x20-\x7E]*$/.test(value)
}

function sanitizeSupabaseAuthStorage() {
  if (typeof localStorage === 'undefined') return

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith('sb-') || !key.endsWith('-auth-token')) continue

    const raw = localStorage.getItem(key)
    if (!raw) {
      localStorage.removeItem(key)
      continue
    }

    try {
      const parsed = JSON.parse(raw) as { access_token?: unknown; refresh_token?: unknown }
      const accessToken = typeof parsed.access_token === 'string' ? parsed.access_token : ''
      const refreshToken = typeof parsed.refresh_token === 'string' ? parsed.refresh_token : ''
      if ((accessToken && !isAsciiHeaderValue(accessToken)) || (refreshToken && !isAsciiHeaderValue(refreshToken))) {
        localStorage.removeItem(key)
      }
    } catch {
      localStorage.removeItem(key)
    }
  }
}

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your project values.'
  )
}

sanitizeSupabaseAuthStorage()
const deviceFingerprint = getDeviceFingerprint()

// Every request carries the device fingerprint as a custom header so that
// Postgres RLS policies (fn_current_device_fingerprint) can identify which
// branch device is writing, without requiring Supabase Auth for branches.
export const supabase = createClient(url ?? '', anonKey ?? '', {
  global: {
    headers: {
      'x-device-fingerprint': isAsciiHeaderValue(deviceFingerprint) ? deviceFingerprint : '',
    },
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
