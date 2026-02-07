'use client';

/**
 * Crane Diagnostics — per-sensor health status with auto-refresh.
 * Shows 7 sensor cards with status badges, last readings, metrics, and errors.
 * Blueprint Section 16: Control-Plane API.
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { CraneDiagnosticsResponse, SensorDiagnostic } from '@mosy/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Radar,
  Cpu,
  Radio,
  Wind,
  Camera,
  Activity,
  RefreshCw,
} from 'lucide-react';

/** Auto-refresh interval in milliseconds. */
const REFRESH_INTERVAL_MS = 30_000;

/** Map sensor names to lucide-react icons. */
function getSensorIcon(sensorName: string): React.ReactNode {
  const name = sensorName.toLowerCase();
  const iconClass = 'h-5 w-5 text-slate-400';

  if (name.includes('lidar')) return <Radar className={iconClass} />;
  if (name.includes('imu')) return <Cpu className={iconClass} />;
  if (name.includes('radar')) return <Radio className={iconClass} />;
  if (name.includes('anemometer') || name.includes('wind')) return <Wind className={iconClass} />;
  if (name.includes('camera')) return <Camera className={iconClass} />;
  return <Activity className={iconClass} />;
}

/** Map sensor status to Badge variant. */
function getStatusVariant(status: SensorDiagnostic['status']): 'success' | 'warning' | 'destructive' | 'secondary' {
  switch (status) {
    case 'healthy': return 'success';
    case 'degraded': return 'warning';
    case 'error': return 'destructive';
    case 'offline': return 'secondary';
  }
}

/** Map overall crane health status to Badge variant. */
function getOverallStatusVariant(status: CraneDiagnosticsResponse['overall_status']): 'success' | 'warning' | 'destructive' {
  switch (status) {
    case 'healthy': return 'success';
    case 'degraded': return 'warning';
    case 'error': return 'destructive';
  }
}

/** Format a timestamp as relative time from now. */
function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
  return Math.floor(diff / 3600000) + 'h ago';
}

/** Format a metric value for display. */
function formatMetricValue(value: number | string): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

export default function CraneDiagnosticsPage() {
  const { craneId } = useParams<{ craneId: string }>();
  const [diagnostics, setDiagnostics] = useState<CraneDiagnosticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /** Fetch diagnostics from the API. */
  const fetchDiagnostics = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    try {
      const res = await fetch(`/api/cranes/${craneId}/diagnostics`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(
          errBody?.error?.message ?? `Failed to fetch diagnostics (${res.status})`
        );
      }
      const data: CraneDiagnosticsResponse = await res.json();
      setDiagnostics(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error loading diagnostics');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [craneId]);

  /** Initial fetch + auto-refresh every 30 seconds. */
  useEffect(() => {
    fetchDiagnostics();
    const interval = setInterval(() => fetchDiagnostics(), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchDiagnostics]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-slate-400">Loading sensor diagnostics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-red-400">{error}</p>
        <Button variant="outline" size="sm" onClick={() => fetchDiagnostics()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!diagnostics) return null;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">{diagnostics.crane_name}</h1>
            <p className="text-sm text-slate-400">
              Sensor Diagnostics — Last updated {formatRelative(diagnostics.last_updated)}
            </p>
          </div>
          <Badge variant={getOverallStatusVariant(diagnostics.overall_status)}>
            {diagnostics.overall_status}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchDiagnostics(true)}
          disabled={isRefreshing}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Sensor Cards Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {diagnostics.sensors.map((sensor) => (
          <Card key={sensor.sensor}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex items-center gap-2">
                {getSensorIcon(sensor.sensor)}
                <CardTitle className="text-sm font-bold text-slate-200">
                  {sensor.sensor}
                </CardTitle>
              </div>
              <Badge variant={getStatusVariant(sensor.status)} className="text-xs">
                {sensor.status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Last Reading */}
              <p className="text-xs text-slate-400">
                Last reading: {formatRelative(sensor.last_reading)}
              </p>

              {/* Metrics */}
              <div className="space-y-1">
                {Object.entries(sensor.metrics).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-xs">
                    <span className="text-slate-400">{key.replace(/_/g, ' ')}</span>
                    <span className="font-medium text-slate-200">
                      {formatMetricValue(value)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Error Message */}
              {sensor.error_message && (
                <p className="text-xs text-red-400">{sensor.error_message}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
