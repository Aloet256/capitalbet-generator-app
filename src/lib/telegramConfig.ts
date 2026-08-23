import { supabase } from './supabase'
import type { TelegramRegionSecretStatus } from '../types/database'

function rpcError(error: { message: string } | null): { error?: string } {
  if (!error) return {}
  if (error.message.includes('fn_get_telegram_region_status')) {
    return { error: 'Encrypted Telegram configuration is not enabled in Supabase yet.' }
  }
  return { error: error.message }
}

export async function getTelegramRegionStatuses(): Promise<{
  data: TelegramRegionSecretStatus[]
  error?: string
}> {
  const { data, error } = await supabase.rpc('fn_get_telegram_region_status')
  if (error) return { data: [], ...rpcError(error) }
  return { data: (data ?? []) as TelegramRegionSecretStatus[] }
}

export async function saveTelegramRegionConfig(args: {
  region: string
  botToken: string
  chatId: string
  password: string
}): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('fn_update_telegram_region_config', {
    p_region: args.region,
    p_bot_token: args.botToken,
    p_chat_id: args.chatId,
    p_password: args.password,
  })
  return rpcError(error)
}

export async function resetTelegramRegionConfig(region: string, password: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('fn_reset_telegram_region_config', {
    p_region: region,
    p_password: password,
  })
  return rpcError(error)
}
