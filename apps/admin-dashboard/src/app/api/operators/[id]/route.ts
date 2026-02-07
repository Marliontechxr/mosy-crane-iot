/**
 * GET /api/operators/{id} — Returns detailed operator profile.
 * PUT /api/operators/{id} — Updates operator fields (name, certs, status, etc.).
 * Blueprint Section 16: Control-Plane API.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { UpdateOperatorRequest, ApiErrorCode } from '@mosy/shared-types';
import { isDemoMode, getDemoOperatorDetail } from '@/lib/demo-data';

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (isDemoMode()) {
    const operator = getDemoOperatorDetail(id);
    return NextResponse.json(operator);
  }

  const token = extractToken(req);
  if (!token) {
    return errorResponse('UNAUTHORIZED', 'Missing or invalid token', 401);
  }

  // Production: query Cosmos DB operators container by id.
  return errorResponse('NOT_FOUND', `Operator ${id} not found`, 404);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (isDemoMode()) {
    let body: UpdateOperatorRequest;
    try {
      body = (await req.json()) as UpdateOperatorRequest;
    } catch {
      return errorResponse('BAD_REQUEST', 'Invalid JSON body', 400);
    }

    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return errorResponse('BAD_REQUEST', 'Invalid email format', 400);
    }

    if (body.status) {
      const validStatuses = ['active', 'inactive', 'suspended'] as const;
      if (!validStatuses.includes(body.status)) {
        return errorResponse('BAD_REQUEST', 'status must be active, inactive, or suspended', 400);
      }
    }

    return NextResponse.json({ success: true, id });
  }

  const token = extractToken(req);
  if (!token) {
    return errorResponse('UNAUTHORIZED', 'Missing or invalid token', 401);
  }

  let body: UpdateOperatorRequest;
  try {
    body = (await req.json()) as UpdateOperatorRequest;
  } catch {
    return errorResponse('BAD_REQUEST', 'Invalid JSON body', 400);
  }

  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return errorResponse('BAD_REQUEST', 'Invalid email format', 400);
  }

  // Production: patch document in Cosmos DB operators container.
  return NextResponse.json({ success: true, id });
}
