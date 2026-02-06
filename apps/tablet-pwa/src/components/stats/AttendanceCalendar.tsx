/**
 * AttendanceCalendar — month view calendar showing days worked.
 * Blueprint Section 12 — Stats Mode component.
 */

interface AttendanceCalendarProps {
  /** Dates the operator worked (ISO date strings YYYY-MM-DD). */
  workedDates: string[];
  /** Currently displayed month (default: current month). */
  month?: Date;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

export function AttendanceCalendar({
  workedDates,
  month = new Date(),
}: AttendanceCalendarProps) {
  const year = month.getFullYear();
  const mon = month.getMonth();

  const firstDay = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();

  const workedSet = new Set(workedDates);
  const today = new Date().toISOString().split('T')[0];

  const monthLabel = month.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  // Build calendar grid
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-mosy-muted uppercase tracking-wider">
        Attendance
      </h3>
      <div className="rounded-xl bg-mosy-surface p-4">
        <div className="mb-2 text-center text-sm font-medium text-slate-300">
          {monthLabel}
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((d, i) => (
            <div
              key={i}
              className="text-center text-[10px] text-mosy-muted font-medium"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={i} className="h-7" />;
            }

            const dateStr = `${year}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isWorked = workedSet.has(dateStr);
            const isToday = dateStr === today;

            return (
              <div
                key={i}
                className={`
                  flex h-7 items-center justify-center rounded text-xs font-mono
                  ${isWorked ? 'bg-green-600/30 text-green-400' : 'text-slate-500'}
                  ${isToday ? 'ring-1 ring-blue-500' : ''}
                `}
              >
                {day}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-2 flex items-center gap-4 text-[10px] text-mosy-muted">
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-2.5 rounded bg-green-600/30" />
            <span>Worked</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-2.5 rounded ring-1 ring-blue-500" />
            <span>Today</span>
          </div>
        </div>
      </div>
    </div>
  );
}
