import { clearLockedBranchId } from './device'
import { supabase } from './supabase'

export async function resetSystemData(password: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('fn_reset_system_data', {
    p_password: password,
  })

  if (error) {
    if (error.message.includes('fn_reset_system_data')) {
      return { error: 'System reset is not enabled in Supabase yet. Run supabase/enable-system-reset.sql once in the Supabase SQL Editor.' }
    }
    return { error: error.message }
  }

  clearLockedBranchId()
  return {}
}
