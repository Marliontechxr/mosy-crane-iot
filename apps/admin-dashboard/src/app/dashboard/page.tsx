'use client';

/**
 * Fleet Overview — main dashboard page with KPIs, map placeholder, and alert feed.
 * Blueprint Section 11.1a.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { useCraneStore } from '@/stores/crane-store';
import { useAlertStore } from '@/stores/alert-store';
import { KPICard } from '@/components/dashboard/kpi-card';
import { AlertFeed } from '@/components/dashboard/alert-feed';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Construction, Users, Activity, Shield } from 'lucide-react';

export default function FleetOverviewPage() {
  const { getAccessToken } = useAuth();
  const { fleet, isLoading, fetchFleet } = useCraneStore();
  const { fetchAlerts } = useAlertStore();
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getAccessToken();
        await Promise.all([fetchFleet(token), fetchAlerts(token)]);
      } catch (err) {
        console.error('Failed to load fleet data:', err);
      }
    };
    load();
  }, [getAccessToken, fetchFleet, fetchAlerts]);

  const totalCranes = fleet.length;
  const onlineCranes = fleet.filter((c) => c.status !== 'offline').length;
  const activeOperators = fleet.filter((c) => c.operator_present).length;
  const criticalAlerts = fleet.filter((c) => c.alert_level === 'critical').length;

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Cranes"
          value={totalCranes}
          subtitle={`${onlineCranes} online`}
          icon={<Construction className="h-5 w-5 text-blue-400" />}
        />
        <KPICard
          title="Active Operators"
          value={activeOperators}
          subtitle={`of ${totalCranes} cranes`}
          icon={<Users className="h-5 w-5 text-green-400" />}
        />
        <KPICard
          title="Today's Lifts"
          value="—"
          subtitle="Real-time tracking"
          icon={<Activity className="h-5 w-5 text-amber-400" />}
        />
        <KPICard
          title="Safety Score"
          value={criticalAlerts === 0 ? '100%' : `${Math.max(0, 100 - criticalAlerts * 10)}%`}
          subtitle={criticalAlerts > 0 ? `${criticalAlerts} critical alerts` : 'All clear'}
          icon={<Shield className="h-5 w-5 text-emerald-400" />}
          trend={criticalAlerts === 0 ? 'up' : 'down'}
          trendValue={criticalAlerts === 0 ? 'Excellent' : 'Needs attention'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Fleet Map Placeholder */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Fleet Map</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-96 items-center justify-center rounded-lg border border-dashed border-slate-600 bg-slate-800/30">
              <div className="text-center">
                <p className="text-sm text-slate-400">Mapbox GL JS integration</p>
                <p className="mt-1 text-xs text-slate-500">
                  Set NEXT_PUBLIC_MAPBOX_TOKEN to enable the fleet map
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alert Feed */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <AlertFeed />
          </CardContent>
        </Card>
      </div>

      {/* Crane List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fleet Status</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-400">Loading fleet data...</p>
          ) : fleet.length === 0 ? (
            <p className="text-sm text-slate-400">No cranes registered yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {fleet.map((crane) => (
                <button
                  key={crane.id}
                  onClick={() => router.push(`/dashboard/crane/${crane.id}`)}
                  className="flex items-center gap-3 rounded-lg border border-slate-700/50 bg-slate-800/30 p-4 text-left transition-colors hover:border-slate-600 hover:bg-slate-800/60"
                >
                  <div
                    className={`h-3 w-3 rounded-full ${
                      crane.status === 'offline'
                        ? 'bg-gray-500'
                        : crane.load_percent >= 90
                          ? 'bg-red-500'
                          : crane.load_percent >= 75
                            ? 'bg-amber-500'
                            : 'bg-green-500'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">{crane.name}</p>
                    <p className="text-xs text-slate-500">
                      {crane.status === 'offline'
                        ? 'Offline'
                        : `${crane.current_load_tonnes.toFixed(1)}t (${Math.round(crane.load_percent)}%)`}
                    </p>
                  </div>
                  <Badge
                    variant={
                      crane.alert_level === 'critical'
                        ? 'destructive'
                        : crane.alert_level === 'warning'
                          ? 'warning'
                          : 'secondary'
                    }
                  >
                    {crane.alert_level || 'normal'}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
