import { Bell, CheckCheck, Wrench, Tv, Lightbulb, Zap, AlertTriangle, Info } from 'lucide-react'
import { useBranchDevice } from '../../context/BranchDeviceContext'
import { useNotifications } from '../../hooks/useNotifications'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDateTime, cn } from '../../lib/utils'
import type { NotificationType } from '../../types/database'

const ICONS: Record<NotificationType, any> = {
  service_due: Wrench,
  dstv_renewal: Tv,
  yaka_low: Lightbulb,
  yaka_reload_due: Lightbulb,
  device_request: Bell,
  power_outage_ongoing: Zap,
  fuel_low: AlertTriangle,
  system: Info,
}

export default function Notifications() {
  const { branch } = useBranchDevice()
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications(branch?.id ?? null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Notifications</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">All alerts and reminder history for {branch?.name}.</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" onClick={markAllRead}>
            <CheckCheck size={16} /> Mark all as read
          </Button>
        )}
      </div>

      <div className="card divide-y divide-slate-100 dark:divide-slate-800/70">
        {loading ? (
          <p className="text-sm text-slate-400 py-4">Loading...</p>
        ) : notifications.length === 0 ? (
          <EmptyState icon={<Bell size={32} />} title="No notifications yet" description="Reminders for servicing, DSTV, and Yaka will appear here." />
        ) : (
          notifications.map((n) => {
            const Icon = ICONS[n.type] ?? Info
            return (
              <div
                key={n.id}
                onClick={() => !n.is_read && markRead(n.id)}
                className={cn('flex items-start gap-3 py-4 first:pt-0 last:pb-0 cursor-pointer', !n.is_read && 'bg-brand-50/50 dark:bg-brand-900/10 -mx-5 px-5 rounded-lg')}
              >
                <div className={cn('rounded-xl p-2 shrink-0', n.is_read ? 'bg-slate-100 text-slate-400 dark:bg-slate-800' : 'bg-brand-100 text-brand-600 dark:bg-brand-900/40')}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{n.title}</p>
                    {!n.is_read && <Badge tone="brand">New</Badge>}
                    {n.telegram_sent && <Badge tone="green">Telegram sent</Badge>}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</p>
                  <p className="text-xs text-slate-400 mt-1">{formatDateTime(n.created_at)}</p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
