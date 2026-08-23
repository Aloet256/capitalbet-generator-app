import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtimeRefresh } from '../lib/realtime'
import type { Branch } from '../types/database'

const SEEN_KEY = 'cb_admin_entries_seen_at'
const SEEN_IDS_KEY = 'cb_admin_entries_seen_ids'
const SEEN_CHANGED_EVENT = 'cb-admin-entry-seen-changed'
const BRANCH_TAB_SEEN_PREFIX = 'cb_admin_branch_tab_seen_at'

type EntryAction = 'insert'
type EntryTableName = 'power_sessions' | 'fuel_refills' | 'services' | 'repairs' | 'dstv_subscriptions' | 'yaka_purchases'
type OperationalRow = Record<string, unknown> & {
  id: string
  branch_id: string
  created_at: string
}

const ENTRY_TABLES: readonly EntryTableName[] = [
  'power_sessions',
  'fuel_refills',
  'services',
  'repairs',
  'dstv_subscriptions',
  'yaka_purchases',
]

const TAB_BY_TABLE: Record<EntryTableName, 'power' | 'fuel' | 'servicing' | 'utilities'> = {
  power_sessions: 'power',
  fuel_refills: 'fuel',
  services: 'servicing',
  repairs: 'servicing',
  dstv_subscriptions: 'utilities',
  yaka_purchases: 'utilities',
}

export interface AdminEntryFeedItem {
  id: string
  actor_type: 'branch_device'
  actor_id: string | null
  branch_id: string | null
  action: EntryAction
  table_name: EntryTableName
  record_id: string
  details: { row: OperationalRow }
  created_at: string
  branches?: Pick<Branch, 'id' | 'name' | 'region'> | null
}

function readSeenAt() {
  const saved = localStorage.getItem(SEEN_KEY)
  if (saved) return saved
  const now = new Date().toISOString()
  localStorage.setItem(SEEN_KEY, now)
  return now
}

function readSeenIds() {
  try {
    const raw = localStorage.getItem(SEEN_IDS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

function saveSeenIds(ids: Set<string>) {
  localStorage.setItem(SEEN_IDS_KEY, JSON.stringify([...ids].slice(-600)))
}

function notifySeenChanged() {
  window.dispatchEvent(new Event(SEEN_CHANGED_EVENT))
}

function branchTabSeenKey(branchId: string, tab: 'power' | 'fuel' | 'servicing' | 'utilities') {
  return `${BRANCH_TAB_SEEN_PREFIX}:${branchId}:${tab}`
}

function money(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount)
    ? `UGX ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount)}`
    : null
}

function rowFromDetails(details: AdminEntryFeedItem['details']): OperationalRow {
  return details.row
}

function latestFirst(a: AdminEntryFeedItem, b: AdminEntryFeedItem) {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

function getFirstError(results: Array<{ error: { message: string } | null }>) {
  return results.find((result) => result.error)?.error?.message ?? null
}

export function describeAdminEntry(item: AdminEntryFeedItem) {
  const row = rowFromDetails(item.details)

  if (item.table_name === 'power_sessions') {
    return {
      title: row.is_ongoing ? 'Power outage started' : 'Power outage recorded',
      detail: String(row.notes || 'Generator timer entry'),
    }
  }

  if (item.table_name === 'fuel_refills') {
    return { title: 'Fuel refill added', detail: `${row.litres ?? 0} L${money(row.cost) ? `, ${money(row.cost)}` : ''}` }
  }

  if (item.table_name === 'services') {
    return { title: 'Service record added', detail: String(row.technician_name || row.work_done || 'Generator service') }
  }

  if (item.table_name === 'repairs') {
    return { title: 'Repair record added', detail: String(row.category || row.description || 'Repair entry') }
  }

  if (item.table_name === 'dstv_subscriptions') {
    return { title: 'DSTV subscription added', detail: `${row.package ?? 'Package'}${money(row.amount) ? `, ${money(row.amount)}` : ''}` }
  }

  return { title: 'Yaka purchase added', detail: `${row.units ?? 0} kWh${money(row.amount) ? `, ${money(row.amount)}` : ''}` }
}

export function useAdminEntryFeed() {
  const [entries, setEntries] = useState<AdminEntryFeedItem[]>([])
  const [seenAt, setSeenAt] = useState(readSeenAt)
  const [seenIds, setSeenIds] = useState(readSeenIds)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)

    const [branchesRes, ...entryResults] = await Promise.all([
      supabase.from('branches').select('id, name, region'),
      ...ENTRY_TABLES.map((table) => supabase.from(table).select('*').order('created_at', { ascending: false }).limit(40)),
    ])

    const firstError = getFirstError([branchesRes, ...entryResults])
    if (firstError) setError(firstError)

    const branchMap = new Map<string, Pick<Branch, 'id' | 'name' | 'region'>>()
    for (const branch of ((branchesRes.data as Pick<Branch, 'id' | 'name' | 'region'>[]) ?? [])) {
      branchMap.set(branch.id, branch)
    }

    const nextEntries = entryResults.flatMap((result, index) => {
      const tableName = ENTRY_TABLES[index]
      return ((result.data as OperationalRow[]) ?? []).map((row) => ({
        id: `${tableName}:${row.id}`,
        actor_type: 'branch_device' as const,
        actor_id: typeof row.created_by_device === 'string' ? row.created_by_device : null,
        branch_id: row.branch_id,
        action: 'insert' as const,
        table_name: tableName,
        record_id: row.id,
        details: { row },
        created_at: row.created_at,
        branches: branchMap.get(row.branch_id) ?? null,
      }))
    })

    setEntries(nextEntries.sort(latestFirst).slice(0, 80))
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const syncSeenState = () => {
      setSeenAt(readSeenAt())
      setSeenIds(readSeenIds())
    }

    window.addEventListener(SEEN_CHANGED_EVENT, syncSeenState)
    window.addEventListener('storage', syncSeenState)
    return () => {
      window.removeEventListener(SEEN_CHANGED_EVENT, syncSeenState)
      window.removeEventListener('storage', syncSeenState)
    }
  }, [])

  const refreshQuietly = useCallback(() => {
    void load(false)
  }, [load])
  useRealtimeRefresh('admin-entry-feed-live', ENTRY_TABLES, refreshQuietly)

  const isEntrySeen = useCallback(
    (entry: AdminEntryFeedItem) => seenIds.has(entry.id) || new Date(entry.created_at).getTime() <= new Date(seenAt).getTime(),
    [seenAt, seenIds]
  )

  const newEntries = useMemo(
    () => entries.filter((entry) => !isEntrySeen(entry)),
    [entries, isEntrySeen]
  )

  const newCountByBranch = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of newEntries) {
      if (!entry.branch_id) continue
      counts.set(entry.branch_id, (counts.get(entry.branch_id) ?? 0) + 1)
    }
    return counts
  }, [newEntries])

  const markSeen = () => {
    const next = new Date().toISOString()
    localStorage.setItem(SEEN_KEY, next)
    setSeenAt(next)
    notifySeenChanged()
  }

  const markEntrySeen = (entry: AdminEntryFeedItem | string) => {
    const entryId = typeof entry === 'string' ? entry : entry.id
    const next = new Set(seenIds)
    next.add(entryId)
    saveSeenIds(next)

    if (typeof entry !== 'string' && entry.branch_id) {
      localStorage.setItem(branchTabSeenKey(entry.branch_id, TAB_BY_TABLE[entry.table_name]), new Date().toISOString())
    }

    setSeenIds(next)
    notifySeenChanged()
  }

  return { entries, loading, error, newEntries, newCountByBranch, markSeen, markEntrySeen, isEntrySeen, reload: load, seenAt }
}
