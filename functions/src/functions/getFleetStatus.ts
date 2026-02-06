// =============================================================================
// MOSY — getFleetStatus Azure Function
// HTTP GET Trigger: Returns real-time fleet dashboard summary.
// Route: GET /api/fleet-status
// =============================================================================

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type {
  CraneDocument,
  TelemetryDocument,
  FleetResponse,
  FleetCraneSummary,
} from '@mosy/shared-types';
import { getContainer } from '../shared/cosmos-client.js';

const ONLINE_TIMEOUT_MS = 30000; // 30 seconds

async function getFleetStatus(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const cranesContainer = getContainer('CRANES');
    const telemetryContainer = getContainer('TELEMETRY');

    // Fetch all cranes
    const { resources: cranes } = await cranesContainer.items
      .query<CraneDocument>({ query: 'SELECT * FROM c' })
      .fetchAll();

    if (cranes.length === 0) {
      const emptyResponse: FleetResponse = {
        total_cranes: 0,
        online_count: 0,
        offline_count: 0,
        critical_alerts: 0,
        cranes: [],
      };
      return { status: 200, jsonBody: emptyResponse };
    }

    const now = Date.now();
    let onlineCount = 0;

    const craneStatuses: FleetCraneSummary[] = await Promise.all(
      cranes.map(async (crane) => {
        const { resources: latestTelemetry } = await telemetryContainer.items
          .query<TelemetryDocument>({
            query: `SELECT TOP 1 * FROM t WHERE t.craneId = @craneId ORDER BY t.timestamp DESC`,
            parameters: [{ name: '@craneId', value: crane.crane_id }],
          })
          .fetchAll();

        const latest = latestTelemetry[0];
        const isOnline = latest ? now - latest.timestamp < ONLINE_TIMEOUT_MS : false;
        if (isOnline) onlineCount++;

        const loadTonnes = latest?.load?.value_tonnes ?? 0;
        const maxLoad = crane.max_load_tonnes || 20;
        const loadPercent = maxLoad > 0 ? Math.round((loadTonnes / maxLoad) * 1000) / 10 : 0;
        const msAgo = latest ? now - latest.timestamp : 999999;

        // Determine alert level from safety flags
        let alertLevel = 'normal';
        if (latest?.safety_flags?.load_over_limit || latest?.safety_flags?.operator_drowsy) {
          alertLevel = 'critical';
        } else if (latest?.safety_flags?.wind_excessive || latest?.safety_flags?.uncommanded_motion) {
          alertLevel = 'warning';
        }

        return {
          id: crane.crane_id,
          name: crane.name,
          status: isOnline ? 'online' : 'offline',
          current_load_tonnes: loadTonnes,
          load_percent: loadPercent,
          operator_present: latest?.safety_flags?.operator_present ?? false,
          last_telemetry_ms_ago: msAgo,
          alert_level: alertLevel,
        };
      })
    );

    // Count critical alerts (last 24 hours, unacknowledged)
    const alertsContainer = getContainer('ALERTS');
    const dayAgo = now - 86400000;
    const { resources: criticalAlertCount } = await alertsContainer.items
      .query<number>({
        query: `SELECT VALUE COUNT(1) FROM a WHERE a.level = 'critical' AND a.timestamp > @cutoff AND a.acknowledged = false`,
        parameters: [{ name: '@cutoff', value: dayAgo }],
      })
      .fetchAll();

    const fleetResponse: FleetResponse = {
      total_cranes: cranes.length,
      online_count: onlineCount,
      offline_count: cranes.length - onlineCount,
      critical_alerts: criticalAlertCount[0] ?? 0,
      cranes: craneStatuses,
    };

    return {
      status: 200,
      jsonBody: fleetResponse,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    };
  } catch (err) {
    context.error(`getFleetStatus failed: ${(err as Error).message}`);
    return {
      status: 500,
      jsonBody: {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve fleet status',
        },
      },
    };
  }
}

app.http('getFleetStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'fleet-status',
  handler: getFleetStatus,
});

export default getFleetStatus;
