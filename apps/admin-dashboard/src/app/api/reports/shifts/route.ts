/**
 * GET /api/reports/shifts — Returns shift report list with optional filtering.
 *
 * Query params:
 *   - from: ISO date string (filter shifts starting after this date)
 *   - to: ISO date string (filter shifts ending before this date)
 *   - operator: Operator ID to filter by
 *   - crane: Crane ID to filter by
 *
 * In demo mode, returns static data from getDemoShiftReports() with client-side filtering.
 * In production, would query Cosmos DB shifts container.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { ShiftReportListItem, ApiErrorResponse } from '@mosy/shared-types';
import { isDemoMode, getDemoShiftReports } from '@/lib/demo-data';

export async function GET(req: NextRequest): Promise<NextResponse<ShiftReportListItem[] | ApiErrorResponse>> {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const operatorFilter = url.searchParams.get('operator');
    const craneFilter = url.searchParams.get('crane');

    if (isDemoMode()) {
      let reports = getDemoShiftReports();

      if (from) {
        const fromMs = new Date(from).getTime();
        if (!Number.isNaN(fromMs)) {
          reports = reports.filter((r) => r.shift_start >= fromMs);
        }
      }

      if (to) {
        const toMs = new Date(to).getTime();
        if (!Number.isNaN(toMs)) {
          reports = reports.filter((r) => r.shift_end <= toMs);
        }
      }

      if (operatorFilter) {
        reports = reports.filter((r) => r.operator_id === operatorFilter);
      }

      if (craneFilter) {
        reports = reports.filter((r) => r.crane_id === craneFilter);
      }

      return NextResponse.json(reports);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED' as const, message: 'Missing or invalid authorization token' } },
        { status: 401 }
      );
    }

    // Production: query Cosmos DB shifts container with filters
    // const cosmosClient = getCosmosClient();
    // const { resources } = await cosmosClient
    //   .database(COSMOS_DATABASE)
    //   .container(COSMOS_CONTAINERS.shifts)
    //   .items.query({ query: 'SELECT * FROM c WHERE ...', parameters: [...] })
    //   .fetchAll();

    return NextResponse.json([]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error fetching shift reports';
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR' as const, message } },
      { status: 500 }
    );
  }
}
