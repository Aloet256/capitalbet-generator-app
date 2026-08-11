import type { AppSettings } from '../types/database'

export const SERVICE_DEFAULT_SETTING_KEYS = [
  'generator_service_technician_name',
  'generator_service_technician_phone',
  'generator_service_company',
  'generator_service_work_done',
  'generator_service_remarks',
] as const

export type ServiceDefaultSettingKey = (typeof SERVICE_DEFAULT_SETTING_KEYS)[number]
export type ServiceDefaults = Pick<AppSettings, ServiceDefaultSettingKey>

export const DEFAULT_SERVICE_SETTINGS: ServiceDefaults = {
  generator_service_technician_name: 'Mr Kawesi',
  generator_service_technician_phone: 'N/A',
  generator_service_company: '',
  generator_service_work_done: 'Servicing Generator',
  generator_service_remarks: 'Servicing Generator',
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  service_reminder_days: 5,
  dstv_reminder_days: 5,
  yaka_reminder_days: 3,
  telegram_default_chat_id: '',
  fuel_price_per_litre: 6500,
  branch_delete_password: '',
  system_reset_password: 'Wendy456',
  ...DEFAULT_SERVICE_SETTINGS,
}

export function coerceTextSetting(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  return String(value)
}
