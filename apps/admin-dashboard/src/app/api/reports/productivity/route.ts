/**
 * GET /api/reports/productivity — Returns productivity metrics with daily lift breakdown.
 *
 * Query params:
 *   - from: ISO date string (start of reporting period)
 *   - to: ISO date string (end of reporting period)
 *
 * In demo mode, returns static data from getDemoProductivityReport().
 * In production, would query Cosmos DB lifts container, group by crane and date,
 * and compute summary statistics.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { ProductivityReportResponse, ApiErrorResponse } from '@mosy/shared-types';
import { isDemoMode, getDemoProductivityReport } from '@/lib/demo-data';

export async function GET(req: NextRequest): Promise<NextResponse<ProductivityReportResponse | ApiErrorResponse>> {
  try {
    if (isDemoMode()) {
      return NextResponse.json(getDemoProductivityReport());
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

    // Production: query Cosmos DB lifts container
    // 1. Group lifts by date and crane_id
    // 2. Sum lifts count and tonnage per group
    // 3. Compute summary totals and daily averages

    return NextResponse.json(getDemoProductivityReport());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error fetching productivity report';
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR' as const, message } },
      { status: 500 }
    );
  }
}
