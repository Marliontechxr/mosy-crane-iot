'use client';

/**
 * TelemetryChart — 60-second rolling Recharts LineChart.
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
import { useCraneStore } from '@/stores/crane-store';

interface TelemetryChartProps {
  /** Number of seconds to display. Default 60. */
  windowSeconds?: number;
}

export function TelemetryChart({ windowSeconds = 60 }: TelemetryChartProps) {
  const telemetryBuffer = useCraneStore((s) => s.telemetryBuffer);

  // Get last N seconds of data
  const now = Date.now();
  const cutoff = now - windowSeconds * 1000;
  const data = telemetryBuffer
    .filter((p) => p.timestamp >= cutoff)
    .map((p) => ({
      time: new Date(p.timestamp).toLocaleTimeString(),
      load: p.load_tonnes,
      angle: p.boom_angle,
      wind: p.wind_speed_kmh,
    }));

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-500">
        Waiting for telemetry data...
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
        <YAxis stroke="#64748b" fontSize={11} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1e293b',
            border: '1px solid #475569',
            borderRadius: '8px',
            color: '#e2e8f0',
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="load"
          name="Load (t)"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="angle"
          name="Boom Angle (°)"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="wind"
          name="Wind (km/h)"
          stroke="#10b981"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
