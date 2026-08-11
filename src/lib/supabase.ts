import { createClient } from '@supabase/supabase-js'
import { getDeviceFingerprint } from './device'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your project values.'
  )
}

// Every request carries the device fingerprint as a custom header so that
// Postgres RLS policies (fn_current_device_fingerprint) can identify which
// branch device is writing, without requiring Supabase Auth for branches.
export const supabase = createClient(url ?? '', anonKey ?? '', {
  global: {
    headers: {
      'x-device-fingerprint': getDeviceFingerprint(),
    },
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
