/**
 * Tests for GET /api/fleet — fleet overview endpoint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('GET /api/fleet', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns 401 without auth header', async () => {
    const { GET } = await import('./route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost:3000/api/fleet');

    const res = await GET(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with invalid auth format', async () => {
    const { GET } = await import('./route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost:3000/api/fleet', {
      headers: { Authorization: 'Basic abc123' },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns fleet data with valid token', async () => {
    const { GET } = await import('./route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost:3000/api/fleet', {
      headers: { Authorization: 'Bearer test-token-123' },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.total_cranes).toBe(3);
    expect(data.online_count).toBe(2);
    expect(data.offline_count).toBe(1);
    expect(data.cranes).toHaveLength(3);
  });

  it('returns cranes with correct structure', async () => {
    const { GET } = await import('./route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost:3000/api/fleet', {
      headers: { Authorization: 'Bearer valid-token' },
    });

    const res = await GET(req);
    const data = await res.json();
    const crane = data.cranes[0];

    expect(crane).toHaveProperty('id');
    expect(crane).toHaveProperty('name');
    expect(crane).toHaveProperty('status');
    expect(crane).toHaveProperty('current_load_tonnes');
    expect(crane).toHaveProperty('load_percent');
    expect(crane).toHaveProperty('operator_present');
    expect(crane).toHaveProperty('last_telemetry_ms_ago');
    expect(crane).toHaveProperty('alert_level');
  });
});
