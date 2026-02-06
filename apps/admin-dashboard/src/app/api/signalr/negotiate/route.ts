/**
 * GET /api/signalr/negotiate — Returns SignalR connection info.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { SignalRNegotiateResponse } from '@mosy/shared-types';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Missing token' } },
      { status: 401 }
    );
  }

  // In production, this calls the Azure SignalR negotiate function.
  // For POC, return a placeholder that the client can detect.
  const signalrUrl = process.env.SIGNALR_SERVICE_URL;

  if (!signalrUrl) {
    return NextResponse.json(
      { error: { code: 'SERVICE_UNAVAILABLE', message: 'SignalR service not configured' } },
      { status: 503 }
    );
  }

  const response: SignalRNegotiateResponse = {
    url: signalrUrl,
    accessToken: authHeader.slice(7),
  };

  return NextResponse.json(response);
}
