/**
 * GET /api/cranes — Returns list of all cranes for crane management.
 * POST /api/cranes — Creates a new crane record.
 * Blueprint Section 16: Control-Plane API.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { CraneListItem, CreateCraneRequest, ApiErrorCode } from '@mosy/shared-types';
import { isDemoMode, getDemoCraneList } from '@/lib/demo-data';

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
    return NextResponse.json(getDemoCraneList());
  }

  const token = extractToken(req);
  if (!token) {
    return errorResponse('UNAUTHORIZED', 'Missing or invalid token', 401);
  }

  // Production: proxy to Azure Functions → query Cosmos DB cranes container.
  const cranes: CraneListItem[] = [];
  return NextResponse.json(cranes);
}

export async function POST(req: NextRequest) {
  if (isDemoMode()) {
    let body: CreateCraneRequest;
    try {
      body = (await req.json()) as CreateCraneRequest;
    } catch {
      return errorResponse('BAD_REQUEST', 'Invalid JSON body', 400);
    }

    if (!body.name || !body.crane_type || !body.max_load_tonnes) {
      return errorResponse('BAD_REQUEST', 'Missing required fields: name, crane_type, max_load_tonnes', 400);
    }

    const validTypes = ['mobile', 'tower', 'overhead'] as const;
    if (!validTypes.includes(body.crane_type)) {
      return errorResponse('BAD_REQUEST', 'crane_type must be mobile, tower, or overhead', 400);
    }

    if (body.max_load_tonnes <= 0) {
      return errorResponse('BAD_REQUEST', 'max_load_tonnes must be positive', 400);
    }

    return NextResponse.json(
      { success: true, id: `CRANE-${Date.now()}` },
      { status: 201 }
    );
  }

  const token = extractToken(req);
  if (!token) {
    return errorResponse('UNAUTHORIZED', 'Missing or invalid token', 401);
  }

  let body: CreateCraneRequest;
  try {
    body = (await req.json()) as CreateCraneRequest;
  } catch {
    return errorResponse('BAD_REQUEST', 'Invalid JSON body', 400);
  }

  if (!body.name || !body.crane_type || !body.max_load_tonnes) {
    return errorResponse('BAD_REQUEST', 'Missing required fields: name, crane_type, max_load_tonnes', 400);
  }

  // Production: forward to Azure Functions → insert into Cosmos DB.
  return NextResponse.json(
    { success: true, id: `CRANE-${Date.now()}` },
    { status: 201 }
  );
}
