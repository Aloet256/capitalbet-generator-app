import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Admin } from '../types/database'

interface AdminAuthCtx {
  loading: boolean
  admin: Admin | null
  signIn: (login: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  changePassword: (newPassword: string) => Promise<{ error?: string }>
  refreshAdmin: () => Promise<Admin | null>
}

const Ctx = createContext<AdminAuthCtx | undefined>(undefined)

function cleanLoginValue(value: string) {
  return value.replace(/\\uFEFF/gi, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
}

const adminUsername = cleanLoginValue(import.meta.env.VITE_ADMIN_USERNAME ?? 'admin')
const adminEmail = cleanLoginValue(import.meta.env.VITE_ADMIN_EMAIL ?? 'admin@capitalbet.example')

function resolveAdminEmail(login: string) {
  const trimmed = cleanLoginValue(login)
  return trimmed.toLowerCase() === adminUsername.toLowerCase() ? adminEmail : trimmed
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [admin, setAdmin] = useState<Admin | null>(null)

  const loadAdminProfile = async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const uid = sessionData.session?.user.id
    if (!uid) {
      setAdmin(null)
      setLoading(false)
      return null
    }
    const { data, error } = await supabase.from('admins').select('*').eq('auth_user_id', uid).maybeSingle()
    if (error) console.error('Admin profile lookup failed', error)
    const profile = (data as Admin) ?? null
    setAdmin(profile)
    setLoading(false)
    return profile
  }

  useEffect(() => {
    loadAdminProfile()
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadAdminProfile()
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = async (login: string, password: string) => {
    const email = resolveAdminEmail(login)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    const profile = await loadAdminProfile()
    if (!profile) {
      await supabase.auth.signOut({ scope: 'local' })
      setAdmin(null)
      return { error: 'This account is not linked to an admin profile.' }
    }
    return {}
  }

  const signOut = async () => {
    await supabase.auth.signOut({ scope: 'local' })
    setAdmin(null)
  }

  const changePassword = async (newPassword: string) => {
    if (newPassword.length < 8) return { error: 'Password must be at least 8 characters.' }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return { error: error.message }
    if (admin) {
      await supabase.from('admins').update({ must_change_password: false }).eq('id', admin.id)
      setAdmin({ ...admin, must_change_password: false })
    }
    return {}
  }

  return (
    <Ctx.Provider value={{ loading, admin, signIn, signOut, changePassword, refreshAdmin: loadAdminProfile }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAdminAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider')
  return ctx
}
