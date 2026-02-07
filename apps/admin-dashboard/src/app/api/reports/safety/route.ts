/**
 * GET /api/reports/safety — Returns safety compliance metrics.
 *
 * Query params:
 *   - from: ISO date string (start of reporting period)
 *   - to: ISO date string (end of reporting period)
 *
 * In demo mode, returns static data from getDemoSafetyCompliance().
 * In production, would query Cosmos DB alerts container and compute
 * alert distribution, resolution times, and compliance percentages.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { SafetyComplianceResponse, ApiErrorResponse } from '@mosy/shared-types';
import { isDemoMode, getDemoSafetyCompliance } from '@/lib/demo-data';

export async function GET(req: NextRequest): Promise<NextResponse<SafetyComplianceResponse | ApiErrorResponse>> {
  try {
    if (isDemoMode()) {
      return NextResponse.json(getDemoSafetyCompliance());
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED' as const, message: 'Missing or invalid authorization token' } },
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const _from = url.searchParams.get('from');
    const _to = url.searchParams.get('to');

    // Production: query Cosmos DB alerts container
    // 1. Count total shifts and safe shifts (no critical alerts) in period
    // 2. Compute alert_distribution by grouping alerts by level
    // 3. Compute top_alert_types by grouping alerts by title/type
    // 4. Calculate avg_resolution_time from acknowledged_at - created_at

    return NextResponse.json(getDemoSafetyCompliance());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error fetching safety compliance';
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR' as const, message } },
      { status: 500 }
    );
  }
}
