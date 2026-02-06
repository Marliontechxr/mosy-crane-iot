// =============================================================================
// MOSY — getOperatorHistory Azure Function
// HTTP GET Trigger: Returns shift history, performance scores, and fatigue data.
// Route: GET /api/operators/{operatorId}/history
// =============================================================================

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { ShiftDocument, OperatorDocument } from '@mosy/shared-types';
import { getContainer } from '../shared/cosmos-client.js';

interface OperatorHistoryResponse {
  operator_id: string;
  operator_name: string;
  total_shifts: number;
  total_lifts: number;
  total_tonnage: number;
  average_performance: number;
  fatigue_incidents: number;
  shifts: Array<{
    shift_id: string;
    crane_id: string;
    shift_start: number;
    shift_end: number;
    duration_hours: number;
    lifts_count: number;
    tonnage: number;
    performance_score: number;
    fatigue_events: number;
  }>;
}

async function getOperatorHistory(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const operatorId = request.params.operatorId;

  if (!operatorId) {
    return {
      status: 400,
      jsonBody: { error: { code: 'BAD_REQUEST', message: 'operatorId path parameter is required' } },
    };
  }

  try {
    const shiftsContainer = getContainer('SHIFTS');
    const operatorsContainer = getContainer('OPERATORS');

    // 1. Get operator profile
    const { resources: operators } = await operatorsContainer.items
      .query<OperatorDocument>({
        query: 'SELECT * FROM o WHERE o.operator_id = @opId',
        parameters: [{ name: '@opId', value: operatorId }],
      })
      .fetchAll();

    const operator = operators[0];
    const operatorName = operator?.name ?? 'Unknown';

    // 2. Get all shifts for this operator, ordered by most recent
    const { resources: shifts } = await shiftsContainer.items
      .query<ShiftDocument>({
        query: `SELECT * FROM s WHERE s.operatorId = @operatorId ORDER BY s.shift_start DESC`,
        parameters: [{ name: '@operatorId', value: operatorId }],
      })
      .fetchAll();

    // 3. Aggregate stats
    let totalLifts = 0;
    let totalTonnage = 0;
    let totalPerformance = 0;
    let performanceCount = 0;
    let fatigueIncidents = 0;

    const shiftSummaries = shifts.map((s) => {
      const durationHours = s.shift_duration_minutes / 60;
      const liftsCount = s.lifts.count;
      const tonnage = s.lifts.total_tonnage;
      const performance = s.performance.score;
      const fatigue = s.performance.fatigue_incidents;

      totalLifts += liftsCount;
      totalTonnage += tonnage;
      fatigueIncidents += fatigue;
      if (performance > 0) {
        totalPerformance += performance;
        performanceCount++;
      }

      return {
        shift_id: s.id,
        crane_id: s.craneId,
        shift_start: s.shift_start,
        shift_end: s.shift_end,
        duration_hours: Math.round(durationHours * 10) / 10,
        lifts_count: liftsCount,
        tonnage: Math.round(tonnage * 10) / 10,
        performance_score: Math.round(performance),
        fatigue_events: fatigue,
      };
    });

    const response: OperatorHistoryResponse = {
      operator_id: operatorId,
      operator_name: operatorName,
      total_shifts: shifts.length,
      total_lifts: totalLifts,
      total_tonnage: Math.round(totalTonnage * 10) / 10,
      average_performance:
        performanceCount > 0
          ? Math.round(totalPerformance / performanceCount)
          : 0,
      fatigue_incidents: fatigueIncidents,
      shifts: shiftSummaries,
    };

    return {
      status: 200,
      jsonBody: response,
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (err) {
    context.error(`getOperatorHistory failed for ${operatorId}: ${(err as Error).message}`);
    return {
      status: 500,
      jsonBody: { error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve operator history' } },
    };
  }
}

app.http('getOperatorHistory', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'operators/{operatorId}/history',
  handler: getOperatorHistory,
});

export default getOperatorHistory;
