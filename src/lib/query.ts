import { supabase } from './supabase'

const PAGE_SIZE = 1000

export async function fetchAllTable<T>(
  table: string,
  orderColumn: string,
  ascending = false
): Promise<{ data: T[]; error: string | null }> {
  const rows: T[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderColumn, { ascending })
      .range(from, from + PAGE_SIZE - 1)

    if (error) return { data: rows, error: error.message }
    const page = (data as T[]) ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return { data: rows, error: null }
}

export async function fetchAllByBranch<T>(
  table: string,
  branchId: string,
  orderColumn: string,
  ascending = false
): Promise<{ data: T[]; error: string | null }> {
  const rows: T[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('branch_id', branchId)
      .order(orderColumn, { ascending })
      .range(from, from + PAGE_SIZE - 1)

    if (error) return { data: rows, error: error.message }
    const page = (data as T[]) ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return { data: rows, error: null }
}

export async function fetchAllSince<T>(
  table: string,
  dateColumn: string,
  since: string,
  orderColumn = dateColumn,
  ascending = false
): Promise<{ data: T[]; error: string | null }> {
  const rows: T[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .gte(dateColumn, since)
      .order(orderColumn, { ascending })
      .range(from, from + PAGE_SIZE - 1)

    if (error) return { data: rows, error: error.message }
    const page = (data as T[]) ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return { data: rows, error: null }
}
