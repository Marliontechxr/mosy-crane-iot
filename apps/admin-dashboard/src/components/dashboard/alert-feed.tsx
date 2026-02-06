'use client';

/**
 * AlertFeed — scrolling list of recent alerts.
 */
import { useAlertStore } from '@/stores/alert-store';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/utils';
import type { AlertLevel } from '@mosy/shared-types';

function getAlertBadgeVariant(level: AlertLevel) {
  switch (level) {
    case 'critical':
      return 'destructive' as const;
    case 'warning':
      return 'warning' as const;
    default:
      return 'secondary' as const;
  }
}

export function AlertFeed() {
  const alerts = useAlertStore((s) => s.alerts);
  const recentAlerts = alerts.slice(0, 20);

  if (recentAlerts.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-slate-500">
        No recent alerts
      </div>
    );
  }

  return (
    <div className="max-h-96 space-y-2 overflow-y-auto">
      {recentAlerts.map((alert) => (
        <div
          key={alert.id}
          className="flex items-start gap-3 rounded-lg border border-slate-700/50 bg-slate-800/30 p-3"
        >
          <Badge variant={getAlertBadgeVariant(alert.level)} className="mt-0.5 shrink-0">
            {alert.level}
          </Badge>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-200">{alert.title}</p>
            <p className="text-xs text-slate-500">
              {alert.crane_id} · {formatRelativeTime(alert.timestamp)}
            </p>
          </div>
          {!alert.acknowledged && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
          )}
        </div>
      ))}
    </div>
  );
}
