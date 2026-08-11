import { supabase } from './supabase'

export async function deleteBranchEntry(table: string, id: string, password: string) {
  const { error } = await supabase.rpc('fn_delete_branch_entry', {
    p_table: table,
    p_id: id,
    p_password: password,
  })

  if (error) {
    if (error.message.includes('fn_delete_branch_entry')) {
      return { error: 'Delete is not enabled in Supabase yet. Run supabase/enable-user-deletes.sql once in the Supabase SQL Editor.' }
    }
    return { error: error.message }
  }
  return {}
}
