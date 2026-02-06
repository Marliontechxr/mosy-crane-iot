/**
 * GET /api/crane/{id} — Returns crane detail with current telemetry.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { CraneDetailResponse } from '@mosy/shared-types';

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

  const response: CraneDetailResponse = {
    id,
    name: id === 'CRANE-001' ? 'Liebherr LTM 1300' : id === 'CRANE-002' ? 'Tadano GR-1000XL' : 'XCMG QY70K',
    type: 'mobile',
    max_load: id === 'CRANE-001' ? 30 : id === 'CRANE-002' ? 36 : 70,
    status: id === 'CRANE-003' ? 'maintenance' : 'active',
    location: {
      site: 'Chennai Port Construction',
      latitude: 13.0827,
      longitude: 80.2707,
    },
    current_telemetry: {
      timestamp: Date.now(),
      load_tonnes: id === 'CRANE-001' ? 12.5 : id === 'CRANE-002' ? 28.3 : 0,
      boom_angle: id === 'CRANE-001' ? 45.2 : id === 'CRANE-002' ? 62.1 : 0,
      wind_speed_kmh: 18.5,
      operator_perclos: 0.08,
    },
    last_calibration: Date.now() - 86400000 * 7,
    firmware: {
      jetson_version: '1.0.0-rc1',
      mqtt_client: '1.6.1',
    },
  };

  return NextResponse.json(response);
}
