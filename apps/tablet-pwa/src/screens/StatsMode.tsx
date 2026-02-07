/**
 * StatsMode — operator profile, daily stats, weekly trends, attendance.
 * Blueprint Section 12 — secondary view accessed by swiping down.
 *
 * Layout (landscape):
 * ┌──────────────┬──────────────────────────────┐
 * │  Operator    │  [DailyStats row]            │
 * │  Profile     │  [WeeklyTrend chart]         │
 * │  Card        │  [AttendanceCalendar]         │
 * │              │                              │
 * │  [↑ Back]    │                              │
 * └──────────────┴──────────────────────────────┘
 */
import { useState, useEffect } from 'react';
import { useTelemetryStore } from '@/stores/telemetry-store';
import { DailyStats } from '@/components/stats/DailyStats';
import { WeeklyTrend, type DayData } from '@/components/stats/WeeklyTrend';
import { AttendanceCalendar } from '@/components/stats/AttendanceCalendar';
import { getShiftDataRange, getTodayShift } from '@/lib/offline-db';
import { publishMessage } from '@/lib/mqtt-publish';

interface StatsModeProps {
  onSwitchMode: () => void;
}

export function StatsMode({ onSwitchMode }: StatsModeProps) {
  const operator = useTelemetryStore((s) => s.operator);
  const alerts = useTelemetryStore((s) => s.alerts);
  const craneId = useTelemetryStore((s) => s.craneId);
  const checkOut = useTelemetryStore((s) => s.checkOut);

  const [dailyData, setDailyData] = useState({
    lifts: 0,
    totalTonnes: 0,
    hoursWorked: 0,
    safetyScore: 100,
    alerts: 0,
  });
  const [weeklyData, setWeeklyData] = useState<DayData[]>([]);
  const [workedDates, setWorkedDates] = useState<string[]>([]);

  // Load shift data from IndexedDB
  useEffect(() => {
    async function loadData() {
      try {
        // Today's data
        const today = await getTodayShift(operator.id);
        if (today) {
          setDailyData({
            lifts: today.lifts,
            totalTonnes: today.totalTonnes,
            hoursWorked: today.hoursWorked,
            safetyScore: today.safetyScore,
            alerts: today.alerts,
          });
        }

        // Weekly data — last 7 days
        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 6);
        const startDate = weekAgo.toISOString().split('T')[0];
        const endDate = now.toISOString().split('T')[0];

        const weekShifts = await getShiftDataRange(startDate, endDate);
        const weekChart: DayData[] = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(weekAgo);
          d.setDate(d.getDate() + i);
          const ds = d.toISOString().split('T')[0];
          const shift = weekShifts.find((s) => s.date === ds);
          weekChart.push({
            date: d.toLocaleDateString('en-US', { weekday: 'short' }),
            lifts: shift?.lifts ?? 0,
            tonnes: shift?.totalTonnes ?? 0,
          });
        }
        setWeeklyData(weekChart);

        // Attendance — current month
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const monthShifts = await getShiftDataRange(monthStart, endDate);
        setWorkedDates(monthShifts.map((s) => s.date));
      } catch (err) {
        console.error('[Stats] Failed to load shift data:', err);
      }
    }

    loadData();
  }, [operator.id]);

  // Compute shift duration
  const shiftHours = (Date.now() - operator.shiftStart) / (1000 * 60 * 60);

  return (
    <div className="flex h-full w-full bg-mosy-bg">
      {/* Left sidebar — operator profile */}
      <div className="flex w-56 flex-col justify-between border-r border-slate-800 p-4">
        <div className="space-y-4">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white">
              {operator.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)}
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-200">
                {operator.name}
              </p>
              <p className="text-xs text-mosy-muted">{operator.id}</p>
            </div>
          </div>

          {/* Shift info */}
          <div className="space-y-2 rounded-lg bg-mosy-surface p-3">
            <div className="flex justify-between text-xs">
              <span className="text-mosy-muted">Shift Started</span>
              <span className="text-slate-300 font-mono">
                {new Date(operator.shiftStart).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-mosy-muted">Duration</span>
              <span className="text-slate-300 font-mono">
                {shiftHours.toFixed(1)}h
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-mosy-muted">Active Alerts</span>
              <span className="text-slate-300 font-mono">
                {alerts.filter((a) => a.level === 'critical' || a.level === 'warning').length}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="space-y-2">
          <button
            onClick={onSwitchMode}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-mosy-surface px-4 py-2 text-sm text-mosy-muted active:bg-slate-700 transition-colors"
            type="button"
            aria-label="Switch to guidance mode"
          >
            <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4l5 5H3l5-5z" />
            </svg>
            Guidance
          </button>

          {/* Check Out button */}
          <button
            onClick={() => {
              publishMessage(`mosy/${craneId}/operator/check-in`, {
                timestamp: new Date().toISOString(),
                crane_id: craneId,
                operator_id: operator.id,
                operator_name: operator.name,
                action: 'check-out',
              });
              checkOut();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-900/30 px-4 py-2 text-sm font-medium text-red-400 active:bg-red-900/50 transition-colors"
            type="button"
            aria-label="End shift and check out"
          >
            <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm3 6.5H5v-1h6v1z" />
            </svg>
            Check Out
          </button>
        </div>
      </div>

      {/* Right content — stats */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <DailyStats
          lifts={dailyData.lifts}
          totalTonnes={dailyData.totalTonnes}
          hoursWorked={dailyData.hoursWorked}
          safetyScore={dailyData.safetyScore}
          alerts={dailyData.alerts}
        />

        <div className="grid grid-cols-2 gap-4">
          <WeeklyTrend data={weeklyData} />
          <AttendanceCalendar workedDates={workedDates} />
        </div>
      </div>
    </div>
  );
}
