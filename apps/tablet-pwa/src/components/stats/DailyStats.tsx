/**
 * DailyStats — today's performance summary: lifts, tonnage, hours, safety score.
 * Blueprint Section 12 — Stats Mode component.
 */

interface DailyStatsProps {
  lifts: number;
  totalTonnes: number;
  hoursWorked: number;
  safetyScore: number;
  alerts: number;
}

interface StatCardProps {
  label: string;
  value: string;
  unit?: string;
  color?: string;
}

function StatCard({ label, value, unit, color = '#E2E8F0' }: StatCardProps) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-mosy-surface px-4 py-3">
      <span className="text-xs text-mosy-muted uppercase tracking-wider">
        {label}
      </span>
      <span className="text-2xl font-bold font-mono" style={{ color }}>
        {value}
      </span>
      {unit && (
        <span className="text-xs text-mosy-muted">{unit}</span>
      )}
    </div>
  );
}

export function DailyStats({
  lifts,
  totalTonnes,
  hoursWorked,
  safetyScore,
  alerts,
}: DailyStatsProps) {
  const scoreColor =
    safetyScore >= 90 ? '#22C55E' : safetyScore >= 70 ? '#F59E0B' : '#EF4444';

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-mosy-muted uppercase tracking-wider">
        Today&apos;s Summary
      </h3>
      <div className="grid grid-cols-5 gap-3">
        <StatCard label="Lifts" value={String(lifts)} />
        <StatCard label="Tonnage" value={totalTonnes.toFixed(1)} unit="tonnes" />
        <StatCard label="Hours" value={hoursWorked.toFixed(1)} unit="hrs" />
        <StatCard
          label="Safety"
          value={`${safetyScore}%`}
          color={scoreColor}
        />
        <StatCard
          label="Alerts"
          value={String(alerts)}
          color={alerts > 0 ? '#F59E0B' : '#22C55E'}
        />
      </div>
    </div>
  );
}
