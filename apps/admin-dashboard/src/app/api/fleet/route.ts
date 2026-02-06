/**
 * GET /api/fleet — Returns fleet overview with all cranes.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { FleetResponse } from '@mosy/shared-types';

/** Validate bearer token exists (actual validation happens at Azure Functions). */
function validateAuth(req: NextRequest): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

export async function GET(req: NextRequest) {
  const token = validateAuth(req);
  if (!token) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token' } },
      { status: 401 }
    );
  }

  // In production, this proxies to Azure Functions which query Cosmos DB.
  // For POC, return structured mock data matching FleetResponse.
  const response: FleetResponse = {
    total_cranes: 3,
    online_count: 2,
    offline_count: 1,
    critical_alerts: 0,
    cranes: [
      {
        id: 'CRANE-001',
        name: 'Liebherr LTM 1300',
        status: 'active',
        current_load_tonnes: 12.5,
        load_percent: 42,
        operator_present: true,
        last_telemetry_ms_ago: 1200,
        alert_level: 'info',
      },
      {
        id: 'CRANE-002',
        name: 'Tadano GR-1000XL',
        status: 'active',
        current_load_tonnes: 28.3,
        load_percent: 78,
        operator_present: true,
        last_telemetry_ms_ago: 800,
        alert_level: 'warning',
      },
      {
        id: 'CRANE-003',
        name: 'XCMG QY70K',
        status: 'offline',
        current_load_tonnes: 0,
        load_percent: 0,
        operator_present: false,
        last_telemetry_ms_ago: 3600000,
        alert_level: 'info',
      },
    ],
  };

  return NextResponse.json(response);
}
