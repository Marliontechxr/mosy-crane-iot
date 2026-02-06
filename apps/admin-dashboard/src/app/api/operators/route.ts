/**
 * GET /api/operators — Returns list of all operators.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { OperatorListItem } from '@mosy/shared-types';
import { isDemoMode, getDemoOperators } from '@/lib/demo-data';

export async function GET(req: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json(getDemoOperators());
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Missing token' } },
      { status: 401 }
    );
  }

  const operators: OperatorListItem[] = [
    {
      id: 'OP-001',
      name: 'Rajesh Kumar',
      email: 'rajesh.kumar@balanetra.com',
      certifications: { mobile_crane: true, expires: Date.now() + 86400000 * 180 },
      performance_metrics: { total_lifts: 1247, safety_score: 96 },
      status: 'active',
    },
    {
      id: 'OP-002',
      name: 'Suresh Patel',
      email: 'suresh.patel@balanetra.com',
      certifications: { mobile_crane: true, expires: Date.now() + 86400000 * 90 },
      performance_metrics: { total_lifts: 892, safety_score: 88 },
      status: 'active',
    },
    {
      id: 'OP-003',
      name: 'Vikram Singh',
      email: 'vikram.singh@balanetra.com',
      certifications: { mobile_crane: false, expires: Date.now() - 86400000 * 30 },
      performance_metrics: { total_lifts: 456, safety_score: 72 },
      status: 'inactive',
    },
  ];

  return NextResponse.json(operators);
}
