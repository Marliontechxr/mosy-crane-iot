/**
 * Tests for GET /api/reports/shifts — shift report list endpoint with filtering.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ShiftReportListItem } from '@mosy/shared-types';

/** Mock next/server since it's not available in test env. */
vi.mock('next/server', () => {
  class MockNextRequest {
    url: string;
    headers: Map<string, string>;

    constructor(url: string, init?: { headers?: Record<string, string> }) {
      this.url = url;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }
  }

  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: (body: unknown, init?: { status?: number }) => ({
        body,
        status: init?.status ?? 200,
        async json() { return body; },
      }),
    },
  };
});

/** Mock the demo-data module so isDemoMode returns true and reports are deterministic. */
vi.mock('@/lib/demo-data', () => ({
  isDemoMode: () => true,
  getDemoShiftReports: () => [
    {
      id: 'REPORT-1',
      shift_start: new Date('2026-01-10T06:00:00Z').getTime(),
      shift_end: new Date('2026-01-10T14:00:00Z').getTime(),
      duration_minutes: 480,
      operator_name: 'Rajesh Kumar',
      operator_id: 'OP-001',
      crane_name: 'Liebherr LTM 1300',
      crane_id: 'DEMO-001',
      lifts_count: 12,
      total_tonnage: 198.0,
      performance_score: 82,
      safety_incidents: 0,
      pdf_url: '/api/reports/shifts/REPORT-1/pdf',
    },
    {
      id: 'REPORT-2',
      shift_start: new Date('2026-01-15T06:00:00Z').getTime(),
      shift_end: new Date('2026-01-15T14:00:00Z').getTime(),
      duration_minutes: 480,
      operator_name: 'Suresh Patel',
      operator_id: 'OP-002',
      crane_name: 'Tadano GR-800XL',
      crane_id: 'DEMO-002',
      lifts_count: 9,
      total_tonnage: 148.5,
      performance_score: 78,
      safety_incidents: 1,
      pdf_url: '/api/reports/shifts/REPORT-2/pdf',
    },
    {
      id: 'REPORT-3',
      shift_start: new Date('2026-01-20T06:00:00Z').getTime(),
      shift_end: new Date('2026-01-20T14:00:00Z').getTime(),
      duration_minutes: 480,
      operator_name: 'Rajesh Kumar',
      operator_id: 'OP-001',
      crane_name: 'XCMG QY70K-I',
      crane_id: 'DEMO-003',
      lifts_count: 15,
      total_tonnage: 247.5,
      performance_score: 90,
      safety_incidents: 0,
      pdf_url: null,
    },
  ],
}));

describe('GET /api/reports/shifts', () => {
  it('returns shift report list in demo mode', async () => {
    const { GET } = await import('./route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost:3000/api/reports/shifts');

    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(3);
    expect(data[0].id).toBe('REPORT-1');
    expect(data[1].id).toBe('REPORT-2');
    expect(data[2].id).toBe('REPORT-3');
  });

  it('returns filtered results when date range params are provided', async () => {
    const { GET } = await import('./route');
    const { NextRequest } = await import('next/server');

    // Filter: from=2026-01-12 to=2026-01-18 — only REPORT-2 fits within that window
    const req = new NextRequest(
      'http://localhost:3000/api/reports/shifts?from=2026-01-12T00:00:00Z&to=2026-01-18T23:59:59Z'
    );

    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('REPORT-2');
    expect(data[0].operator_id).toBe('OP-002');
  });

  it('returns items matching the ShiftReportListItem shape', async () => {
    const { GET } = await import('./route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost:3000/api/reports/shifts');

    const res = await GET(req);
    const data: ShiftReportListItem[] = await res.json();

    for (const item of data) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('shift_start');
      expect(item).toHaveProperty('shift_end');
      expect(item).toHaveProperty('duration_minutes');
      expect(item).toHaveProperty('operator_name');
      expect(item).toHaveProperty('operator_id');
      expect(item).toHaveProperty('crane_name');
      expect(item).toHaveProperty('crane_id');
      expect(item).toHaveProperty('lifts_count');
      expect(item).toHaveProperty('total_tonnage');
      expect(item).toHaveProperty('performance_score');
      expect(item).toHaveProperty('safety_incidents');
      expect(item).toHaveProperty('pdf_url');

      expect(typeof item.id).toBe('string');
      expect(typeof item.shift_start).toBe('number');
      expect(typeof item.shift_end).toBe('number');
      expect(typeof item.duration_minutes).toBe('number');
      expect(typeof item.operator_name).toBe('string');
      expect(typeof item.operator_id).toBe('string');
      expect(typeof item.crane_name).toBe('string');
      expect(typeof item.crane_id).toBe('string');
      expect(typeof item.lifts_count).toBe('number');
      expect(typeof item.total_tonnage).toBe('number');
      expect(typeof item.performance_score).toBe('number');
      expect(typeof item.safety_incidents).toBe('number');
      expect(item.pdf_url === null || typeof item.pdf_url === 'string').toBe(true);
    }
  });
});
