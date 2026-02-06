'use client';

/**
 * Crane Detail — live telemetry, load gauge, camera feed, alerts.
 * Blueprint Section 11.1b.
 */
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { useCraneStore } from '@/stores/crane-store';
import { TelemetryChart } from '@/components/dashboard/telemetry-chart';
import { LoadMomentGauge } from '@/components/dashboard/load-gauge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatTimestamp } from '@/lib/utils';

export default function CraneDetailPage() {
  const params = useParams<{ craneId: string }>();
  const craneId = params.craneId;
  const { getAccessToken } = useAuth();
  const { selectedCrane, isLoading, selectCrane } = useCraneStore();

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getAccessToken();
        await selectCrane(craneId, token);
      } catch (err) {
        console.error('Failed to load crane:', err);
      }
    };
    load();
  }, [craneId, getAccessToken, selectCrane]);

  if (isLoading || !selectedCrane) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-slate-400">Loading crane data...</p>
      </div>
    );
  }

  const { current_telemetry } = selectedCrane;
  const loadPercent = selectedCrane.max_load > 0
    ? (current_telemetry.load_tonnes / selectedCrane.max_load) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{selectedCrane.name}</h1>
          <p className="text-sm text-slate-400">
            {selectedCrane.type} · {selectedCrane.location.site} · Last update:{' '}
            {formatTimestamp(current_telemetry.timestamp)}
          </p>
        </div>
        <Badge variant={selectedCrane.status === 'active' ? 'success' : 'secondary'}>
          {selectedCrane.status}
        </Badge>
      </div>

      {/* Live Panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Load Gauge */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Load Moment</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <LoadMomentGauge
              percent={loadPercent}
              loadTonnes={current_telemetry.load_tonnes}
              maxTonnes={selectedCrane.max_load}
            />
          </CardContent>
        </Card>

        {/* Camera Feed Placeholder */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Boom Camera</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-600 bg-slate-800/30">
              <p className="text-xs text-slate-500">MJPEG stream when on-site network</p>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Boom Angle</span>
              <span className="text-sm font-medium text-white">
                {current_telemetry.boom_angle.toFixed(1)}°
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Wind Speed</span>
              <span className="text-sm font-medium text-white">
                {current_telemetry.wind_speed_kmh.toFixed(1)} km/h
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Operator PERCLOS</span>
              <span className="text-sm font-medium text-white">
                {(current_telemetry.operator_perclos * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Max Load</span>
              <span className="text-sm font-medium text-white">{selectedCrane.max_load}t</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Last Calibration</span>
              <span className="text-sm font-medium text-white">
                {formatTimestamp(selectedCrane.last_calibration)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="live">
        <TabsList>
          <TabsTrigger value="live">Live Telemetry</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="live">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Real-Time Telemetry (60s)</CardTitle>
            </CardHeader>
            <CardContent>
              <TelemetryChart windowSeconds={60} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="flex h-64 items-center justify-center p-6">
              <p className="text-sm text-slate-400">
                Historical telemetry with date range picker — connect to Cosmos DB query
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card>
            <CardContent className="flex h-64 items-center justify-center p-6">
              <p className="text-sm text-slate-400">Filtered alert table for this crane</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config">
          <Card>
            <CardContent className="flex h-64 items-center justify-center p-6">
              <p className="text-sm text-slate-400">
                Crane configuration, calibration, and device twin status
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
