/**
 * GET /api/operators/{id}/shifts — Returns operator shift history.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { ShiftSummary } from '@mosy/shared-types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Missing token' } },
      { status: 401 }
    );
  }

  const now = Date.now();
  const shifts: ShiftSummary[] = Array.from({ length: 5 }, (_, i) => ({
    id: `SHIFT-${id}-${i + 1}`,
    shift_start: now - (i + 1) * 86400000,
    shift_end: now - (i + 1) * 86400000 + 28800000,
    duration_minutes: 480,
    crane_id: i % 2 === 0 ? 'CRANE-001' : 'CRANE-002',
    lifts: { count: 12 + Math.floor(Math.random() * 8), total_tonnage: 150 + Math.random() * 100 },
    performance: { score: 85 + Math.floor(Math.random() * 15), safety_incidents: i === 3 ? 1 : 0 },
  }));

  return NextResponse.json(shifts);
}
