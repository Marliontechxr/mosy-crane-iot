/**
 * WeeklyTrend — 7-day line chart of daily lifts and tonnage.
 * Blueprint Section 12 — Stats Mode component using Recharts.
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

export interface DayData {
  date: string;
  lifts: number;
  tonnes: number;
}

interface WeeklyTrendProps {
  data: DayData[];
}

export function WeeklyTrend({ data }: WeeklyTrendProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-mosy-muted uppercase tracking-wider">
        Weekly Trend
      </h3>
      <div className="rounded-xl bg-mosy-surface p-4">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#64748B', fontSize: 11 }}
              axisLine={{ stroke: '#334155' }}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: '#64748B', fontSize: 11 }}
              axisLine={{ stroke: '#334155' }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: '#64748B', fontSize: 11 }}
              axisLine={{ stroke: '#334155' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0F172A',
                border: '1px solid #334155',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: '#94A3B8' }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="lifts"
              name="Lifts"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="tonnes"
              name="Tonnes"
              stroke="#22C55E"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
