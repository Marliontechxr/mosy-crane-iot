/**
 * AlertBadge — shows alert count with pulsing animation for active alerts.
 * Blueprint Section 12 — HUD overlay component.
 */
import type { AlertLevel } from '@mosy/shared-types';

interface AlertBadgeProps {
  /** Number of active (unacknowledged) alerts. */
  count: number;
  /** Highest active alert level. */
  maxLevel: AlertLevel | null;
  /** Called when tapped to show alert details. */
  onTap?: () => void;
}

function getAlertBadgeColor(level: AlertLevel | null): string {
  switch (level) {
    case 'critical':
      return 'bg-red-600';
    case 'warning':
      return 'bg-amber-500';
    case 'info':
      return 'bg-blue-500';
    default:
      return 'bg-slate-600';
  }
}

export function AlertBadge({ count, maxLevel, onTap }: AlertBadgeProps) {
  if (count === 0) return null;

  const bgColor = getAlertBadgeColor(maxLevel);
  const shouldPulse = maxLevel === 'critical' || maxLevel === 'warning';

  return (
    <button
      onClick={onTap}
      className={`
        relative flex items-center gap-1.5 rounded-full px-3 py-1.5
        ${bgColor} text-white text-sm font-bold shadow-lg
        ${shouldPulse ? 'animate-pulse' : ''}
        active:scale-95 transition-transform
      `}
      type="button"
      aria-label={`${count} active alerts`}
    >
      {/* Bell icon */}
      <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1.5A4.5 4.5 0 0 0 3.5 6v2.5L2 10v1h12v-1l-1.5-1.5V6A4.5 4.5 0 0 0 8 1.5zM6.5 12a1.5 1.5 0 0 0 3 0h-3z" />
      </svg>
      <span>{count}</span>
    </button>
  );
}
