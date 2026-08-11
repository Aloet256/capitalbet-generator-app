import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Branch } from '../types/database'

export interface BranchWithAvailability extends Pick<Branch, 'id' | 'name' | 'region' | 'code'> {
  device_locked: boolean
}

export function useBranches() {
  const [branches, setBranches] = useState<BranchWithAvailability[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    supabase
      .rpc('get_branch_selection_list')
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          setError(queryError.message)
          setBranches([])
        } else {
          setBranches(
            (data ?? []).map((row: any) => ({
              id: row.branch_id,
              name: row.name,
              region: row.region,
              code: row.code ?? null,
              device_locked: Boolean(row.device_locked),
            }))
          )
        }
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const grouped = branches.reduce<Record<string, BranchWithAvailability[]>>((acc, b) => {
    acc[b.region] = acc[b.region] ?? []
    acc[b.region].push(b)
    return acc
  }, {})

  return { branches, grouped, loading, error }
}
