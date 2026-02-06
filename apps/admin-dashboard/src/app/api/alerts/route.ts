/**
 * GET /api/alerts — Returns alert history with filtering.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { AlertListItem, AlertLevel } from '@mosy/shared-types';
import { isDemoMode, getDemoAlerts } from '@/lib/demo-data';

export async function GET(req: NextRequest) {
  if (isDemoMode()) {
    const url = new URL(req.url);
    const levelFilter = url.searchParams.get('level') as AlertLevel | null;
    let alerts = getDemoAlerts();
    if (levelFilter) {
      alerts = alerts.filter((a) => a.level === levelFilter);
    }
    return NextResponse.json(alerts);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Missing token' } },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const levelFilter = url.searchParams.get('level') as AlertLevel | null;

  const now = Date.now();
  let alerts: AlertListItem[] = [
    {
      id: 'ALERT-001',
      crane_id: 'CRANE-002',
      timestamp: now - 300000,
      level: 'warning',
      title: 'Load approaching limit (78%)',
      description: 'Current load 28.3t approaching maximum safe load of 36t',
      acknowledged: false,
      acknowledgement_required: true,
    },
    {
      id: 'ALERT-002',
      crane_id: 'CRANE-001',
      timestamp: now - 1800000,
      level: 'info',
      title: 'Operator shift started',
      description: 'Operator Rajesh Kumar started shift on CRANE-001',
      acknowledged: true,
      acknowledgement_required: false,
    },
    {
      id: 'ALERT-003',
      crane_id: 'CRANE-002',
      timestamp: now - 3600000,
      level: 'critical',
      title: 'Wind speed exceeded limit',
      description: 'Wind speed 73 km/h exceeded maximum 72 km/h',
      acknowledged: true,
      acknowledgement_required: true,
    },
    {
      id: 'ALERT-004',
      crane_id: 'CRANE-001',
      timestamp: now - 7200000,
      level: 'warning',
      title: 'Operator drowsiness detected',
      description: 'PERCLOS score 0.28 approaching fatigue threshold',
      acknowledged: false,
      acknowledgement_required: true,
    },
  ];

  if (levelFilter) {
    alerts = alerts.filter((a) => a.level === levelFilter);
  }

  return NextResponse.json(alerts);
}
