/**
 * POST /api/alerts/{id}/acknowledge — Acknowledge an alert.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { AcknowledgeResponse } from '@mosy/shared-types';

export async function POST(
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

  try {
    const body = await req.json();
    if (!body.acknowledged_by) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'acknowledged_by is required' } },
        { status: 400 }
      );
    }

    const response: AcknowledgeResponse = {
      success: true,
      acknowledged_at: Date.now(),
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Invalid request body' } },
      { status: 400 }
    );
  }
}
