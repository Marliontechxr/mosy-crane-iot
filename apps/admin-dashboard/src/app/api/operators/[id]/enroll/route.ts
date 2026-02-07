/**
 * POST /api/operators/{id}/enroll — Face enrollment stub.
 * Accepts base64 image data and returns enrollment status.
 * Full face recognition (InsightFace/ArcFace) to be implemented in Phase 2.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode, getDemoEnrollment } from '@/lib/demo-data';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (isDemoMode()) {
    return NextResponse.json(getDemoEnrollment());
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Missing token' } },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    if (!body.image_data || typeof body.image_data !== 'string') {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'image_data (base64 string) is required' } },
        { status: 400 }
      );
    }

    // Stub: In production, this would send image to InsightFace for embedding generation
    return NextResponse.json({
      success: true,
      enrollment_status: 'pending' as const,
      message: `Enrollment queued for operator ${id}. Face matching will be enabled once processed.`,
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Invalid request body' } },
      { status: 400 }
    );
  }
}
