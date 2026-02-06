/**
 * WindIndicator — displays wind speed with color-coded zone.
 * Blueprint Section 12 — HUD overlay component.
 */
import {
  getWindZone,
  getWindColor,
  formatWindSpeed,
} from '@/lib/hud-calculations';

interface WindIndicatorProps {
  /** Wind speed in km/h. */
  speedKmh: number;
  /** Wind direction in degrees (0 = N, 90 = E). */
  directionDeg: number;
}

/** Cardinal direction from degrees. */
function getCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return dirs[idx];
}

export function WindIndicator({ speedKmh, directionDeg }: WindIndicatorProps) {
  const zone = getWindZone(speedKmh);
  const color = getWindColor(zone);
  const cardinal = getCardinal(directionDeg);

  return (
    <div className="flex flex-col items-center gap-0.5">
      {/* Wind arrow */}
      <svg
        width={32}
        height={32}
        viewBox="0 0 32 32"
        style={{ transform: `rotate(${directionDeg}deg)` }}
      >
        <path
          d="M16 4 L22 24 L16 18 L10 24 Z"
          fill={color}
          opacity={0.9}
        />
      </svg>
      {/* Speed */}
      <span
        className="text-sm font-bold font-mono"
        style={{ color }}
      >
        {formatWindSpeed(speedKmh)}
      </span>
      {/* Direction */}
      <span className="text-[10px] text-mosy-muted font-mono">
        {cardinal}
      </span>
      {/* Zone label for high/dangerous */}
      {(zone === 'high' || zone === 'dangerous') && (
        <span
          className="text-[10px] font-bold uppercase animate-pulse"
          style={{ color }}
        >
          {zone === 'dangerous' ? 'STOP OPS' : 'HIGH WIND'}
        </span>
      )}
    </div>
  );
}
