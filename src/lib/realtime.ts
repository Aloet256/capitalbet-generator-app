import { useEffect } from 'react'
import { supabase } from './supabase'

export function useRealtimeRefresh(
  channelName: string,
  tables: readonly string[],
  onChange: () => void | Promise<void>,
  enabled = true,
  pollMs = 2000
) {
  const tableKey = tables.join('|')

  useEffect(() => {
    if (!enabled || tables.length === 0) return

    let timer: number | null = null
    const refresh = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void onChange()
      }, 150)
    }

    const channel = supabase.channel(`${channelName}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh)
    }
    channel.subscribe()
    const pollId = pollMs > 0 ? window.setInterval(refresh, pollMs) : null

    return () => {
      if (timer !== null) window.clearTimeout(timer)
      if (pollId !== null) window.clearInterval(pollId)
      supabase.removeChannel(channel)
    }
  }, [channelName, enabled, onChange, pollMs, tableKey])
}
