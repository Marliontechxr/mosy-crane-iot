/**
 * GuidanceLines — parking camera-style guide lines overlaid on camera feed.
 * Blueprint Section 12 — visual overlay for load positioning guidance.
 *
 * Draws converging perspective lines and a center cross to help the
 * operator position loads precisely. Lines are green (safe zone),
 * amber (warning), and red (danger close).
 */

interface GuidanceLinesProps {
  /** Width of the SVG overlay. */
  width: number;
  /** Height of the SVG overlay. */
  height: number;
}

export function GuidanceLines({ width, height }: GuidanceLinesProps) {
  const cx = width / 2;
  const cy = height / 2;

  // Converging lines — left side
  const leftLines = [
    { x1: 0, y1: height, x2: cx - 40, y2: cy + 20, color: '#EF4444' },
    { x1: width * 0.1, y1: height, x2: cx - 20, y2: cy + 40, color: '#F59E0B' },
    { x1: width * 0.2, y1: height, x2: cx - 10, y2: cy + 60, color: '#22C55E' },
  ];

  // Converging lines — right side (mirror)
  const rightLines = [
    { x1: width, y1: height, x2: cx + 40, y2: cy + 20, color: '#EF4444' },
    { x1: width * 0.9, y1: height, x2: cx + 20, y2: cy + 40, color: '#F59E0B' },
    { x1: width * 0.8, y1: height, x2: cx + 10, y2: cy + 60, color: '#22C55E' },
  ];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-none"
    >
      {/* Guide lines */}
      {[...leftLines, ...rightLines].map((line, i) => (
        <line
          key={i}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={line.color}
          strokeWidth={2}
          opacity={0.6}
        />
      ))}

      {/* Center crosshair */}
      <line
        x1={cx - 20}
        y1={cy}
        x2={cx + 20}
        y2={cy}
        stroke="#22C55E"
        strokeWidth={1.5}
        opacity={0.7}
      />
      <line
        x1={cx}
        y1={cy - 20}
        x2={cx}
        y2={cy + 20}
        stroke="#22C55E"
        strokeWidth={1.5}
        opacity={0.7}
      />
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="none"
        stroke="#22C55E"
        strokeWidth={1.5}
        opacity={0.7}
      />
    </svg>
  );
}
