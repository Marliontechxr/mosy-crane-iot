/**
 * GET /api/sites/{id} — Returns a single site by ID.
 * PUT /api/sites/{id} — Updates site properties.
 * Blueprint Section 16: Control-Plane API.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { UpdateSiteRequest, ApiErrorCode } from '@mosy/shared-types';
import { isDemoMode, getDemoSites } from '@/lib/demo-data';

/** Build a typed error response. */
function errorResponse(code: ApiErrorCode, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Validate bearer token presence (actual JWT validation at Azure Functions). */
function extractToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (isDemoMode()) {
    const sites = getDemoSites();
    const site = sites.find((s) => s.id === id);
    if (!site) {
      return errorResponse('NOT_FOUND', `Site ${id} not found`, 404);
    }
    return NextResponse.json(site);
  }

  const token = extractToken(req);
  if (!token) {
    return errorResponse('UNAUTHORIZED', 'Missing or invalid token', 401);
  }

  // Production: query Cosmos DB sites container by id.
  return errorResponse('NOT_FOUND', `Site ${id} not found`, 404);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (isDemoMode()) {
    let body: UpdateSiteRequest;
    try {
      body = (await req.json()) as UpdateSiteRequest;
    } catch {
      return errorResponse('BAD_REQUEST', 'Invalid JSON body', 400);
    }

    if (body.latitude !== undefined) {
      if (typeof body.latitude !== 'number' || body.latitude < -90 || body.latitude > 90) {
        return errorResponse('BAD_REQUEST', 'latitude must be between -90 and 90', 400);
      }
    }

    if (body.longitude !== undefined) {
      if (typeof body.longitude !== 'number' || body.longitude < -180 || body.longitude > 180) {
        return errorResponse('BAD_REQUEST', 'longitude must be between -180 and 180', 400);
      }
    }

    if (body.status) {
      const validStatuses = ['active', 'inactive'] as const;
      if (!validStatuses.includes(body.status)) {
        return errorResponse('BAD_REQUEST', 'status must be active or inactive', 400);
      }
    }

    return NextResponse.json({ success: true, id });
  }

  const token = extractToken(req);
  if (!token) {
    return errorResponse('UNAUTHORIZED', 'Missing or invalid token', 401);
  }

  let body: UpdateSiteRequest;
  try {
    body = (await req.json()) as UpdateSiteRequest;
  } catch {
    return errorResponse('BAD_REQUEST', 'Invalid JSON body', 400);
  }

  if (body.latitude !== undefined) {
    if (typeof body.latitude !== 'number' || body.latitude < -90 || body.latitude > 90) {
      return errorResponse('BAD_REQUEST', 'latitude must be between -90 and 90', 400);
    }
  }

  if (body.longitude !== undefined) {
    if (typeof body.longitude !== 'number' || body.longitude < -180 || body.longitude > 180) {
      return errorResponse('BAD_REQUEST', 'longitude must be between -180 and 180', 400);
    }
  }

  // Production: patch document in Cosmos DB sites container.
  return NextResponse.json({ success: true, id });
}
