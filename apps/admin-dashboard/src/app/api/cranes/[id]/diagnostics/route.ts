/**
 * GET /api/cranes/{id}/diagnostics — Returns sensor health diagnostics for a crane.
 * Blueprint Section 16: Control-Plane API.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { ApiErrorCode } from '@mosy/shared-types';
import { isDemoMode, getDemoDiagnostics } from '@/lib/demo-data';

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
    return NextResponse.json(getDemoDiagnostics(id));
  }

  const token = extractToken(req);
  if (!token) {
    return errorResponse('UNAUTHORIZED', 'Missing or invalid token', 401);
  }

  // Production: query Cosmos DB diagnostics container for crane sensor health.
  return errorResponse('NOT_FOUND', `Diagnostics for crane ${id} not found`, 404);
}
