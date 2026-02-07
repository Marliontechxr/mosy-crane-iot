/**
 * GET /api/cranes/{id}/calibration — Returns calibration profile for a crane.
 * PUT /api/cranes/{id}/calibration — Updates calibration (gauges, safety limits).
 * Blueprint Section 16: Control-Plane API.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { CalibrationProfileResponse, ApiErrorCode } from '@mosy/shared-types';
import { isDemoMode, getDemoCalibration } from '@/lib/demo-data';

/** Build a typed error response. */
function errorResponse(code: ApiErrorCode, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Validate bearer token presence. */
function extractToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

/** Validate a gauge ROI value is within 0-100 range. */
function isValidRoi(value: number): boolean {
  return typeof value === 'number' && value >= 0 && value <= 100;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (isDemoMode()) {
    return NextResponse.json(getDemoCalibration(id));
  }

  const token = extractToken(req);
  if (!token) {
    return errorResponse('UNAUTHORIZED', 'Missing or invalid token', 401);
  }

  // Production: query Cosmos DB calibrations container by crane_id.
  const profile: CalibrationProfileResponse = getDemoCalibration(id);
  return NextResponse.json(profile);
}

/** Shape of gauge data submitted from the calibration wizard. */
interface GaugeSubmission {
  type: 'digital' | 'analog';
  roi: { x: number; y: number; width: number; height: number };
  scale_min: number;
  scale_max: number;
  unit: string;
}

/** Shape of calibration update payload. */
interface CalibrationPayload {
  gauges: Record<string, GaugeSubmission>;
  safety_limits: {
    max_load_tonnes: number;
    max_boom_angle_degrees: number;
    max_wind_kmh: number;
  };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (isDemoMode()) {
    let body: CalibrationPayload;
    try {
      body = (await req.json()) as CalibrationPayload;
    } catch {
      return errorResponse('BAD_REQUEST', 'Invalid JSON body', 400);
    }

    if (!body.gauges || typeof body.gauges !== 'object') {
      return errorResponse('BAD_REQUEST', 'Missing gauges object', 400);
    }

    // Validate each gauge
    for (const [name, gauge] of Object.entries(body.gauges)) {
      if (!gauge.type || !['digital', 'analog'].includes(gauge.type)) {
        return errorResponse('BAD_REQUEST', `Gauge "${name}" has invalid type`, 400);
      }
      if (!gauge.roi) {
        return errorResponse('BAD_REQUEST', `Gauge "${name}" missing ROI`, 400);
      }
      const { x, y, width, height } = gauge.roi;
      if (!isValidRoi(x) || !isValidRoi(y) || !isValidRoi(width) || !isValidRoi(height)) {
        return errorResponse('BAD_REQUEST', `Gauge "${name}" ROI values must be 0-100`, 400);
      }
      if (typeof gauge.scale_min !== 'number' || typeof gauge.scale_max !== 'number') {
        return errorResponse('BAD_REQUEST', `Gauge "${name}" scale_min/scale_max must be numbers`, 400);
      }
      if (gauge.scale_min >= gauge.scale_max) {
        return errorResponse('BAD_REQUEST', `Gauge "${name}" scale_min must be less than scale_max`, 400);
      }
    }

    // Validate safety limits
    if (body.safety_limits) {
      const { max_load_tonnes, max_boom_angle_degrees, max_wind_kmh } = body.safety_limits;
      if (max_load_tonnes !== undefined && max_load_tonnes <= 0) {
        return errorResponse('BAD_REQUEST', 'max_load_tonnes must be positive', 400);
      }
      if (max_boom_angle_degrees !== undefined && (max_boom_angle_degrees <= 0 || max_boom_angle_degrees > 90)) {
        return errorResponse('BAD_REQUEST', 'max_boom_angle_degrees must be 1-90', 400);
      }
      if (max_wind_kmh !== undefined && max_wind_kmh <= 0) {
        return errorResponse('BAD_REQUEST', 'max_wind_kmh must be positive', 400);
      }
    }

    return NextResponse.json({
      success: true,
      crane_id: id,
      calibration_id: `cal-${id}-v${Date.now()}`,
      effective_from: Date.now(),
    });
  }

  const token = extractToken(req);
  if (!token) {
    return errorResponse('UNAUTHORIZED', 'Missing or invalid token', 401);
  }

  let body: CalibrationPayload;
  try {
    body = (await req.json()) as CalibrationPayload;
  } catch {
    return errorResponse('BAD_REQUEST', 'Invalid JSON body', 400);
  }

  if (!body.gauges || typeof body.gauges !== 'object') {
    return errorResponse('BAD_REQUEST', 'Missing gauges object', 400);
  }

  // Production: upsert into Cosmos DB calibrations container.
  return NextResponse.json({
    success: true,
    crane_id: id,
    calibration_id: `cal-${id}-v${Date.now()}`,
    effective_from: Date.now(),
  });
}
