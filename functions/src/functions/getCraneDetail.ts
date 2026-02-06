// =============================================================================
// MOSY — getCraneDetail Azure Function
// HTTP GET Trigger: Returns detailed info for a specific crane.
// Route: GET /api/crane/{craneId}
// =============================================================================

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type {
  CraneDocument,
  TelemetryDocument,
  CraneDetailResponse,
} from '@mosy/shared-types';
import { getContainer } from '../shared/cosmos-client.js';

async function getCraneDetail(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const craneId = request.params.craneId;

  if (!craneId) {
    return {
      status: 400,
      jsonBody: { error: { code: 'BAD_REQUEST', message: 'craneId path parameter is required' } },
    };
  }

  try {
    const telemetryContainer = getContainer('TELEMETRY');
    const cranesContainer = getContainer('CRANES');

    // 1. Get crane config
    const { resources: craneRecords } = await cranesContainer.items
      .query<CraneDocument>({
        query: 'SELECT * FROM c WHERE c.crane_id = @craneId',
        parameters: [{ name: '@craneId', value: craneId }],
      })
      .fetchAll();

    const crane = craneRecords[0];

    // 2. Get latest telemetry
    const { resources: latestTelemetry } = await telemetryContainer.items
      .query<TelemetryDocument>({
        query: 'SELECT TOP 1 * FROM t WHERE t.craneId = @craneId ORDER BY t.timestamp DESC',
        parameters: [{ name: '@craneId', value: craneId }],
      })
      .fetchAll();

    const latest = latestTelemetry[0];

    const craneDetail: CraneDetailResponse = {
      id: craneId,
      name: crane?.name ?? craneId,
      type: crane?.crane_type ?? 'mobile',
      max_load: crane?.max_load_tonnes ?? 20,
      status: crane?.status ?? 'active',
      location: {
        site: crane?.location?.site_name ?? '',
        latitude: crane?.location?.latitude ?? 13.1939,
        longitude: crane?.location?.longitude ?? 79.8711,
      },
      current_telemetry: {
        timestamp: latest?.timestamp ?? 0,
        load_tonnes: latest?.load?.value_tonnes ?? 0,
        boom_angle: latest?.position?.boom_angle_degrees ?? 0,
        wind_speed_kmh: latest?.environment?.wind_speed_kmh ?? 0,
        operator_perclos: 0,
      },
      last_calibration: crane?.last_calibration ?? 0,
      firmware: {
        jetson_version: '',
        mqtt_client: '',
      },
    };

    return {
      status: 200,
      jsonBody: craneDetail,
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (err) {
    context.error(`getCraneDetail failed for ${craneId}: ${(err as Error).message}`);
    return {
      status: 500,
      jsonBody: { error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve crane details' } },
    };
  }
}

app.http('getCraneDetail', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'crane/{craneId}',
  handler: getCraneDetail,
});

export default getCraneDetail;
