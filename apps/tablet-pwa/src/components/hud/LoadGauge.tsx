/**
 * LoadGauge — circular arc gauge showing load percentage of rated capacity.
 * Blueprint Section 12 — HUD overlay component.
 */
import {
  computeLoadPercent,
  getLoadZone,
  getLoadColor,
  describeArc,
  computeGaugeAngle,
} from '@/lib/hud-calculations';

interface LoadGaugeProps {
  /** Current load in tonnes. */
  currentTonnes: number;
  /** Crane rated capacity in tonnes. */
  ratedCapacityTonnes: number;
  /** Gauge diameter in pixels. */
  size?: number;
}

export function LoadGauge({
  currentTonnes,
  ratedCapacityTonnes,
  size = 140,
}: LoadGaugeProps) {
  const percent = computeLoadPercent(currentTonnes, ratedCapacityTonnes);
  const zone = getLoadZone(percent);
  const color = getLoadColor(zone);
  const angle = computeGaugeAngle(percent);

  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - 16) / 2;

  // Background arc (full 270°)
  const bgPath = describeArc(cx, cy, radius, 0, 270);
  // Value arc
  const valuePath = angle > 0 ? describeArc(cx, cy, radius, 0, Math.min(angle, 270)) : '';

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background track */}
        <path
          d={bgPath}
          fill="none"
          stroke="#1E293B"
          strokeWidth={8}
          strokeLinecap="round"
        />
        {/* Value arc */}
        {valuePath && (
          <path
            d={valuePath}
            fill="none"
            stroke={color}
            strokeWidth={8}
            strokeLinecap="round"
          />
        )}
        {/* Center text — percentage */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontSize={size * 0.22}
          fontWeight="bold"
          fontFamily="monospace"
        >
          {Math.round(percent)}%
        </text>
        {/* Sub-label — tonnes */}
        <text
          x={cx}
          y={cy + size * 0.16}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#94A3B8"
          fontSize={size * 0.1}
          fontFamily="monospace"
        >
          {currentTonnes.toFixed(1)}t / {ratedCapacityTonnes}t
        </text>
      </svg>
      <span
        className="mt-1 text-xs font-semibold uppercase tracking-wider"
        style={{ color }}
      >
        {zone === 'overload' ? 'OVERLOAD' : zone === 'warning' ? 'WARNING' : 'LOAD'}
      </span>
    </div>
  );
}
