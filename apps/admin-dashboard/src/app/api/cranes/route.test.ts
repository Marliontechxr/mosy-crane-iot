/**
 * Tests for GET /api/cranes and POST /api/cranes — crane management endpoints.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Mock next/server since it's not available in test env. */
vi.mock('next/server', () => {
  class MockNextRequest {
    url: string;
    headers: Map<string, string>;
    private _body: unknown;

    constructor(
      url: string,
      init?: { headers?: Record<string, string>; method?: string; body?: string },
    ) {
      this.url = url;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
      this._body = init?.body ? JSON.parse(init.body) : undefined;
    }

    async json() {
      if (this._body === undefined) {
        throw new SyntaxError('Unexpected end of JSON input');
      }
      return this._body;
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

/** Mock demo-data module — isDemoMode returns true by default. */
vi.mock('@/lib/demo-data', () => ({
  isDemoMode: vi.fn(() => true),
  getDemoCraneList: vi.fn(() => [
    {
      id: 'DEMO-001', name: 'Liebherr LTM 1300', crane_type: 'mobile', model: 'LTM 1300-6.3',
      serial_number: 'LTM-2024-00147', max_load_tonnes: 50, boom_length_m: 60,
      site_name: 'Chennai Port Construction', status: 'active', last_calibration: Date.now(),
    },
    {
      id: 'DEMO-002', name: 'Tadano GR-800XL', crane_type: 'mobile', model: 'GR-800XL-4',
      serial_number: 'TAD-2023-00892', max_load_tonnes: 80, boom_length_m: 47,
      site_name: 'Chennai Port Construction', status: 'maintenance', last_calibration: Date.now(),
    },
    {
      id: 'DEMO-003', name: 'XCMG QY70K-I', crane_type: 'mobile', model: 'QY70K-I',
      serial_number: 'XCMG-2024-01203', max_load_tonnes: 70, boom_length_m: 44,
      site_name: 'Bangalore Highway Bridge', status: 'active', last_calibration: Date.now(),
    },
  ]),
}));

describe('GET /api/cranes', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns the demo crane list when demo mode is enabled', async () => {
    const { GET } = await import('./route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost:3000/api/cranes');

    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(3);
    expect(data[0]).toHaveProperty('id', 'DEMO-001');
    expect(data[0]).toHaveProperty('name', 'Liebherr LTM 1300');
    expect(data[0]).toHaveProperty('crane_type', 'mobile');
    expect(data[0]).toHaveProperty('max_load_tonnes', 50);
    expect(data[1]).toHaveProperty('id', 'DEMO-002');
    expect(data[2]).toHaveProperty('id', 'DEMO-003');
  });
});

describe('POST /api/cranes', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns 201 with success response for a valid crane body', async () => {
    const { POST } = await import('./route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost:3000/api/cranes', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Crane Alpha',
        crane_type: 'tower',
        max_load_tonnes: 25,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
    expect(data.id).toMatch(/^CRANE-\d+$/);
  });

  it('returns 400 when required field name is missing', async () => {
    const { POST } = await import('./route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost:3000/api/cranes', {
      method: 'POST',
      body: JSON.stringify({
        crane_type: 'mobile',
        max_load_tonnes: 40,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();

    expect(data.error).toBeDefined();
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toContain('Missing required fields');
  });

  it('returns 400 when crane_type is not a valid type', async () => {
    const { POST } = await import('./route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost:3000/api/cranes', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Invalid Type Crane',
        crane_type: 'submarine',
        max_load_tonnes: 15,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();

    expect(data.error).toBeDefined();
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toContain('crane_type must be mobile, tower, or overhead');
  });
});
