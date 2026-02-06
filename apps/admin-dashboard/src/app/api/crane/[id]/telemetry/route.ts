/**
 * GET /api/crane/{id}/telemetry — Returns telemetry history.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { TelemetryHistoryResponse, TelemetryPoint } from '@mosy/shared-types';

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

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') ?? '60', 10);

  // Generate mock telemetry points
  const now = Date.now();
  const points: TelemetryPoint[] = Array.from({ length: limit }, (_, i) => ({
    timestamp: now - (limit - i) * 1000,
    load_tonnes: 12 + Math.random() * 5,
    boom_angle: 40 + Math.random() * 10,
    boom_distance_m: 15 + Math.random() * 3,
    wind_speed_kmh: 15 + Math.random() * 8,
    operator_perclos: 0.05 + Math.random() * 0.1,
    status: 'valid',
  }));

  const response: TelemetryHistoryResponse = {
    crane_id: id,
    points,
    count: points.length,
  };

  return NextResponse.json(response);
}
