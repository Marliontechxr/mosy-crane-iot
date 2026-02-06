/**
 * HUD calculation utilities — color zones, clearance formatting, wind thresholds.
 * Blueprint Section 12 — operator tablet HUD overlay.
 */

/** Load percentage color zones. */
export type LoadZone = 'normal' | 'warning' | 'overload';

/**
 * Determine the load zone based on percentage of rated capacity.
 * - normal: 0–79%
 * - warning: 80–99%
 * - overload: 100%+
 */
export function getLoadZone(loadPercent: number): LoadZone {
  if (loadPercent >= 100) return 'overload';
  if (loadPercent >= 80) return 'warning';
  return 'normal';
}

/** CSS color for a load zone. */
export function getLoadColor(zone: LoadZone): string {
  switch (zone) {
    case 'normal':
      return '#22C55E'; // green-500
    case 'warning':
      return '#F59E0B'; // amber-500
    case 'overload':
      return '#EF4444'; // red-500
  }
}

/**
 * Compute load percentage from current load and rated capacity.
 * Clamps to 0–150 range for display purposes.
 */
export function computeLoadPercent(
  currentTonnes: number,
  ratedCapacityTonnes: number,
): number {
  if (ratedCapacityTonnes <= 0) return 0;
  const pct = (currentTonnes / ratedCapacityTonnes) * 100;
  return Math.max(0, Math.min(150, pct));
}

/** Wind speed color zones. */
export type WindZone = 'calm' | 'moderate' | 'high' | 'dangerous';

/**
 * Determine wind zone from speed in km/h.
 * Based on typical crane wind limits:
 * - calm: 0–29 km/h
 * - moderate: 30–49 km/h
 * - high: 50–71 km/h (approaching shutdown)
 * - dangerous: 72+ km/h (shutdown required)
 */
export function getWindZone(speedKmh: number): WindZone {
  if (speedKmh >= 72) return 'dangerous';
  if (speedKmh >= 50) return 'high';
  if (speedKmh >= 30) return 'moderate';
  return 'calm';
}

/** CSS color for a wind zone. */
export function getWindColor(zone: WindZone): string {
  switch (zone) {
    case 'calm':
      return '#22C55E';
    case 'moderate':
      return '#F59E0B';
    case 'high':
      return '#F97316'; // orange-500
    case 'dangerous':
      return '#EF4444';
  }
}

/** Ground clearance zones based on distance in meters. */
export type ClearanceZone = 'safe' | 'caution' | 'danger';

/**
 * Determine clearance zone from distance in meters.
 * - safe: > 3m
 * - caution: 1–3m
 * - danger: < 1m
 */
export function getClearanceZone(distanceM: number): ClearanceZone {
  if (distanceM < 1) return 'danger';
  if (distanceM <= 3) return 'caution';
  return 'safe';
}

/** CSS color for a clearance zone. */
export function getClearanceColor(zone: ClearanceZone): string {
  switch (zone) {
    case 'safe':
      return '#22C55E';
    case 'caution':
      return '#F59E0B';
    case 'danger':
      return '#EF4444';
  }
}

/**
 * Format distance in meters for HUD display.
 * Shows 1 decimal place for values under 10m, 0 for larger.
 */
export function formatClearance(distanceM: number): string {
  if (distanceM < 10) return `${distanceM.toFixed(1)}m`;
  return `${Math.round(distanceM)}m`;
}

/**
 * Format wind speed for HUD display.
 */
export function formatWindSpeed(speedKmh: number): string {
  return `${Math.round(speedKmh)} km/h`;
}

/**
 * Compute the arc sweep angle for a gauge from 0–270 degrees.
 * Input is a 0–100 (or higher) percentage.
 */
export function computeGaugeAngle(percent: number): number {
  const clamped = Math.max(0, Math.min(150, percent));
  return (clamped / 100) * 270;
}

/**
 * Compute SVG arc path for a circular gauge.
 * Returns the SVG path `d` attribute for an arc from startAngle to endAngle.
 */
export function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const startRad = ((startAngle - 90) * Math.PI) / 180;
  const endRad = ((endAngle - 90) * Math.PI) / 180;

  const x1 = cx + radius * Math.cos(startRad);
  const y1 = cy + radius * Math.sin(startRad);
  const x2 = cx + radius * Math.cos(endRad);
  const y2 = cy + radius * Math.sin(endRad);

  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
}
