/**
 * ClearanceDisplay — shows ground clearance distance with color-coded zone.
 * Blueprint Section 12 — HUD overlay component.
 */
import {
  getClearanceZone,
  getClearanceColor,
  formatClearance,
} from '@/lib/hud-calculations';

interface ClearanceDisplayProps {
  /** Distance to ground/obstacle in meters. */
  distanceM: number;
}

export function ClearanceDisplay({ distanceM }: ClearanceDisplayProps) {
  const zone = getClearanceZone(distanceM);
  const color = getClearanceColor(zone);

  return (
    <div className="flex flex-col items-center gap-0.5">
      {/* Clearance icon — simplified distance bars */}
      <svg width={28} height={28} viewBox="0 0 28 28">
        <rect x={4} y={22} width={20} height={3} rx={1} fill="#475569" />
        <rect x={8} y={12} width={12} height={2} rx={1} fill={color} opacity={zone === 'safe' ? 1 : 0.3} />
        <rect x={6} y={16} width={16} height={2} rx={1} fill={color} opacity={zone !== 'danger' ? 1 : 0.3} />
        <rect x={4} y={20} width={20} height={2} rx={1} fill={color} />
        {/* Down arrow */}
        <path d="M14 2 L18 8 L10 8 Z" fill={color} />
      </svg>
      {/* Value */}
      <span
        className="text-lg font-bold font-mono"
        style={{ color }}
      >
        {formatClearance(distanceM)}
      </span>
      {/* Label */}
      <span className="text-[10px] text-mosy-muted uppercase tracking-wider">
        clearance
      </span>
      {/* Danger warning */}
      {zone === 'danger' && (
        <span className="text-[10px] font-bold text-red-500 animate-pulse uppercase">
          too close
        </span>
      )}
    </div>
  );
}
