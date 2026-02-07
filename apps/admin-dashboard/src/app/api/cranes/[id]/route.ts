/**
 * GET /api/cranes/{id} — Returns a single crane detail for management.
 * PUT /api/cranes/{id} — Updates crane properties (name, status, site, etc.).
 * Blueprint Section 16: Control-Plane API.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { UpdateCraneRequest, ApiErrorCode } from '@mosy/shared-types';
import { isDemoMode, getDemoCraneList } from '@/lib/demo-data';

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
    const cranes = getDemoCraneList();
    const crane = cranes.find((c) => c.id === id);
    if (!crane) {
      return errorResponse('NOT_FOUND', `Crane ${id} not found`, 404);
    }
    return NextResponse.json(crane);
  }

  const token = extractToken(req);
  if (!token) {
    return errorResponse('UNAUTHORIZED', 'Missing or invalid token', 401);
  }

  // Production: query Cosmos DB cranes container by id.
  return errorResponse('NOT_FOUND', `Crane ${id} not found`, 404);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (isDemoMode()) {
    let body: UpdateCraneRequest;
    try {
      body = (await req.json()) as UpdateCraneRequest;
    } catch {
      return errorResponse('BAD_REQUEST', 'Invalid JSON body', 400);
    }

    if (body.crane_type) {
      const validTypes = ['mobile', 'tower', 'overhead'] as const;
      if (!validTypes.includes(body.crane_type)) {
        return errorResponse('BAD_REQUEST', 'crane_type must be mobile, tower, or overhead', 400);
      }
    }

    if (body.status) {
      const validStatuses = ['active', 'maintenance', 'retired'] as const;
      if (!validStatuses.includes(body.status)) {
        return errorResponse('BAD_REQUEST', 'status must be active, maintenance, or retired', 400);
      }
    }

    if (body.max_load_tonnes !== undefined && body.max_load_tonnes <= 0) {
      return errorResponse('BAD_REQUEST', 'max_load_tonnes must be positive', 400);
    }

    return NextResponse.json({ success: true, id });
  }

  const token = extractToken(req);
  if (!token) {
    return errorResponse('UNAUTHORIZED', 'Missing or invalid token', 401);
  }

  let body: UpdateCraneRequest;
  try {
    body = (await req.json()) as UpdateCraneRequest;
  } catch {
    return errorResponse('BAD_REQUEST', 'Invalid JSON body', 400);
  }

  if (body.max_load_tonnes !== undefined && body.max_load_tonnes <= 0) {
    return errorResponse('BAD_REQUEST', 'max_load_tonnes must be positive', 400);
  }

  // Production: patch document in Cosmos DB cranes container.
  return NextResponse.json({ success: true, id });
}
