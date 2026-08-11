import { createClient } from '@supabase/supabase-js'
import { getDeviceFingerprint } from './device'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const AUTH_STORAGE_KEY = 'cb_supabase_auth'
const INVALID_HEADER_RECOVERY_KEY = 'cb_invalid_header_recovery_attempted'

function isAsciiHeaderValue(value: string) {
  return /^[\x20-\x7E]*$/.test(value)
}

function asciiHeaderValue(value: unknown) {
  return String(value ?? '').replace(/[^\x20-\x7E]/g, '')
}

function installHeaderValueGuard() {
  if (typeof Headers === 'undefined') return
  const proto = Headers.prototype as Headers & { __capitalbetHeaderGuard?: boolean }
  if (proto.__capitalbetHeaderGuard) return

  const originalSet = Headers.prototype.set
  const originalAppend = Headers.prototype.append

  Headers.prototype.set = function set(name: string, value: string) {
    try {
      return originalSet.call(this, name, value)
    } catch (error) {
      if (errorMessage(error).includes('non ISO-8859-1')) {
        return originalSet.call(this, name, asciiHeaderValue(value))
      }
      throw error
    }
  }

  Headers.prototype.append = function append(name: string, value: string) {
    try {
      return originalAppend.call(this, name, value)
    } catch (error) {
      if (errorMessage(error).includes('non ISO-8859-1')) {
        return originalAppend.call(this, name, asciiHeaderValue(value))
      }
      throw error
    }
  }

  proto.__capitalbetHeaderGuard = true
}

function sanitizeSupabaseAuthStorage() {
  if (typeof localStorage === 'undefined') return

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index)
    const isSupabaseDefaultAuthKey = key?.startsWith('sb-') && key.endsWith('-auth-token')
    if (!key || (key !== AUTH_STORAGE_KEY && !isSupabaseDefaultAuthKey)) continue

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

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message ?? '')
  return String(error ?? '')
}

function clearAppBrowserStorage() {
  if (typeof localStorage === 'undefined') return

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index)
    if (!key) continue
    const isSupabaseAuthKey = key.startsWith('sb-') && key.endsWith('-auth-token')
    if (key.startsWith('cb_') || isSupabaseAuthKey || key === 'supabase.auth.token') {
      localStorage.removeItem(key)
    }
  }
}

export function recoverFromInvalidHeaderError(error: unknown) {
  const message = errorMessage(error)
  const isInvalidHeader =
    message.includes('non ISO-8859-1') || (message.includes("Failed to execute 'set' on 'Headers'") && message.includes('Headers'))

  if (!isInvalidHeader || typeof sessionStorage === 'undefined' || typeof window === 'undefined') return false
  if (sessionStorage.getItem(INVALID_HEADER_RECOVERY_KEY) === '1') return false

  sessionStorage.setItem(INVALID_HEADER_RECOVERY_KEY, '1')
  clearAppBrowserStorage()
  window.location.reload()
  return true
}

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your project values.'
  )
}

installHeaderValueGuard()
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
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
  },
})
