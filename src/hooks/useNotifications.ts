import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtimeRefresh } from '../lib/realtime'
import type { AppNotification } from '../types/database'

export function useNotifications(branchId: string | null) {
  const channelId = useRef(Math.random().toString(36).slice(2))
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    let query = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(200)
    if (branchId) query = query.eq('branch_id', branchId)
    const { data, error: queryError } = await query
    if (queryError) setError(queryError.message)
    else {
      setError(null)
      setNotifications((data as AppNotification[]) ?? [])
    }
    if (showLoading) setLoading(false)
  }, [branchId])

  useEffect(() => {
    void load()
  }, [load])

  const refreshQuietly = useCallback(() => load(false), [load])
  useRealtimeRefresh(`notifications-live-${branchId ?? 'all'}-${channelId.current}`, ['notifications'], refreshQuietly)

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
  }

  const markAllRead = async () => {
    const ids = notifications.filter((n) => !n.is_read).map((n) => n.id)
    if (!ids.length) return
    await supabase.from('notifications').update({ is_read: true }).in('id', ids)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length

  return { notifications, unreadCount, loading, error, markRead, markAllRead, reload: load }
}
