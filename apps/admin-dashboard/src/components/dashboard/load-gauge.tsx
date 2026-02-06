'use client';

/**
 * LoadMomentGauge — circular SVG gauge showing load percentage.
 */
import { cn } from '@/lib/utils';

interface LoadGaugeProps {
  percent: number;
  loadTonnes: number;
  maxTonnes: number;
  size?: number;
}

export function LoadMomentGauge({ percent, loadTonnes, maxTonnes, size = 200 }: LoadGaugeProps) {
  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPercent = Math.min(Math.max(percent, 0), 100);
  const offset = circumference - (clampedPercent / 100) * circumference * 0.75; // 270 degree arc
  const rotation = -225; // Start at bottom-left

  const getColor = (pct: number) => {
    if (pct >= 90) return '#dc2626';
    if (pct >= 75) return '#f59e0b';
    return '#22c55e';
  };

  const color = getColor(clampedPercent);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#334155"
          strokeWidth="12"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * 0.25}
          strokeLinecap="round"
          transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
        />
        {/* Value arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
          className="transition-all duration-500"
        />
        {/* Center text */}
        <text
          x={size / 2}
          y={size / 2 - 10}
          textAnchor="middle"
          className="fill-white text-3xl font-bold"
          fontSize="28"
        >
          {Math.round(clampedPercent)}%
        </text>
        <text
          x={size / 2}
          y={size / 2 + 15}
          textAnchor="middle"
          className="fill-slate-400 text-sm"
          fontSize="14"
        >
          {loadTonnes.toFixed(1)}t / {maxTonnes}t
        </text>
      </svg>
      <span
        className={cn(
          'mt-2 text-xs font-semibold uppercase',
          clampedPercent >= 90 && 'text-red-500',
          clampedPercent >= 75 && clampedPercent < 90 && 'text-amber-500',
          clampedPercent < 75 && 'text-green-500'
        )}
      >
        {clampedPercent >= 90 ? 'OVERLOAD' : clampedPercent >= 75 ? 'WARNING' : 'NORMAL'}
      </span>
    </div>
  );
}
