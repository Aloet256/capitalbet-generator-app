import { supabase } from './supabase'

export async function saveBranchAccessPin(pin: string, password: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('fn_update_branch_access_pin', {
    p_pin: pin,
    p_password: password,
  })
  return error ? { error: error.message } : {}
}
