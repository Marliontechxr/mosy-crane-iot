/**
 * GET  /api/sites — Returns all construction sites.
 * POST /api/sites — Creates a new site record.
 * Blueprint Section 16: Control-Plane API.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { CreateSiteRequest, SiteListItem, ApiErrorCode } from '@mosy/shared-types';
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

export async function GET(req: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json(getDemoSites());
  }

  const token = extractToken(req);
  if (!token) {
    return errorResponse('UNAUTHORIZED', 'Missing or invalid token', 401);
  }

  // Production: proxy to Azure Functions -> query Cosmos DB sites container.
  const sites: SiteListItem[] = [];
  return NextResponse.json(sites);
}

export async function POST(req: NextRequest) {
  if (isDemoMode()) {
    let body: CreateSiteRequest;
    try {
      body = (await req.json()) as CreateSiteRequest;
    } catch {
      return errorResponse('BAD_REQUEST', 'Invalid JSON body', 400);
    }

    if (!body.name || !body.address || !body.city || !body.state) {
      return errorResponse(
        'BAD_REQUEST',
        'Missing required fields: name, address, city, state',
        400
      );
    }

    if (
      typeof body.latitude !== 'number' ||
      typeof body.longitude !== 'number' ||
      body.latitude < -90 ||
      body.latitude > 90 ||
      body.longitude < -180 ||
      body.longitude > 180
    ) {
      return errorResponse(
        'BAD_REQUEST',
        'latitude must be between -90 and 90, longitude between -180 and 180',
        400
      );
    }

    return NextResponse.json(
      { success: true, id: `SITE-${Date.now()}` },
      { status: 201 }
    );
  }

  const token = extractToken(req);
  if (!token) {
    return errorResponse('UNAUTHORIZED', 'Missing or invalid token', 401);
  }

  let body: CreateSiteRequest;
  try {
    body = (await req.json()) as CreateSiteRequest;
  } catch {
    return errorResponse('BAD_REQUEST', 'Invalid JSON body', 400);
  }

  if (!body.name || !body.address || !body.city || !body.state) {
    return errorResponse(
      'BAD_REQUEST',
      'Missing required fields: name, address, city, state',
      400
    );
  }

  // Production: forward to Azure Functions -> insert into Cosmos DB.
  return NextResponse.json(
    { success: true, id: `SITE-${Date.now()}` },
    { status: 201 }
  );
}
