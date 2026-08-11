export type DeviceStatus = 'pending' | 'approved' | 'revoked'
export type DstvPackage = 'Access' | 'Family' | 'Compact' | 'Compact Plus' | 'Premium'
export type RepairCategory =
  | 'Generator'
  | 'Wiring/Electrical'
  | 'Fuel System'
  | 'Battery'
  | 'Cooling System'
  | 'Control Panel'
  | 'Structural'
  | 'Other'

export type NotificationType =
  | 'service_due'
  | 'dstv_renewal'
  | 'yaka_low'
  | 'yaka_reload_due'
  | 'device_request'
  | 'power_outage_ongoing'
  | 'fuel_low'
  | 'system'

export interface Branch {
  id: string
  name: string
  region: string
  code: string | null
  telegram_chat_id: string | null
  active: boolean
  created_at: string
}

export interface Device {
  id: string
  device_fingerprint: string
  branch_id: string
  status: DeviceStatus
  device_label: string | null
  requested_at: string
  decided_at: string | null
  decided_by: string | null
  last_seen_at: string
  branches?: Branch
}

export interface Admin {
  id: string
  auth_user_id: string
  full_name: string
  email: string
  must_change_password: boolean
  created_at: string
}

export interface PowerSession {
  id: string
  branch_id: string
  session_date: string
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
  is_ongoing: boolean
  notes: string | null
  created_by_device: string | null
  created_at: string
}

export interface FuelRefill {
  id: string
  branch_id: string
  refill_date: string
  cost: number
  litres: number
  authorized_by: string
  remarks: string | null
  created_by_device: string | null
  created_at: string
}

export interface Service {
  id: string
  branch_id: string
  service_date: string
  next_service_date: string
  technician_name: string
  technician_phone: string
  company: string | null
  cost: number | null
  items_replaced: string | null
  repairs_done: string | null
  work_done: string
  remarks: string | null
  reminder_sent: boolean
  created_by_device: string | null
  created_at: string
}

export interface Repair {
  id: string
  branch_id: string
  repair_date: string
  category: RepairCategory
  description: string
  cost: number | null
  handled_by: string | null
  remarks: string | null
  created_by_device: string | null
  created_at: string
}

export interface DstvSubscription {
  id: string
  branch_id: string
  subscription_date: string
  renewal_date: string
  smart_card_number: string
  package: DstvPackage
  amount: number
  receipt_number: string | null
  remarks: string | null
  reminder_sent: boolean
  created_by_device: string | null
  created_at: string
}

export interface YakaPurchase {
  id: string
  branch_id: string
  purchase_date: string
  meter_number: string
  units: number
  amount: number
  expected_reload_date: string
  receipt_number: string | null
  remarks: string | null
  reminder_sent: boolean
  created_by_device: string | null
  created_at: string
}

export interface AppNotification {
  id: string
  branch_id: string | null
  type: NotificationType
  channel: 'in_app' | 'telegram' | 'both'
  title: string
  message: string
  is_read: boolean
  telegram_sent: boolean
  telegram_sent_at: string | null
  related_table: string | null
  related_id: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  actor_type: 'branch_device' | 'admin' | 'system'
  actor_id: string | null
  branch_id: string | null
  action: string
  table_name: string | null
  record_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

export interface AppSettings {
  service_reminder_days: number
  dstv_reminder_days: number
  yaka_reminder_days: number
  telegram_default_chat_id: string
  fuel_price_per_litre: number
  branch_delete_password: string
  system_reset_password: string
  generator_service_technician_name: string
  generator_service_technician_phone: string
  generator_service_company: string
  generator_service_work_done: string
  generator_service_remarks: string
}
