/**
 * Tests for GET /api/alerts — alert history endpoint with filtering.
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

describe('GET /api/alerts', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns 401 without auth header', async () => {
    const { GET } = await import('./route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost:3000/api/alerts');

    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns all alerts with valid token', async () => {
    const { GET } = await import('./route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost:3000/api/alerts', {
      headers: { Authorization: 'Bearer valid-token' },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(4);
  });

  it('filters alerts by level', async () => {
    const { GET } = await import('./route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost:3000/api/alerts?level=critical', {
      headers: { Authorization: 'Bearer valid-token' },
    });

    const res = await GET(req);
    const data = await res.json();

    expect(data.length).toBe(1);
    expect(data[0].level).toBe('critical');
  });

  it('filters alerts by warning level', async () => {
    const { GET } = await import('./route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost:3000/api/alerts?level=warning', {
      headers: { Authorization: 'Bearer valid-token' },
    });

    const res = await GET(req);
    const data = await res.json();

    expect(data.length).toBe(2);
    data.forEach((alert: { level: string }) => {
      expect(alert.level).toBe('warning');
    });
  });

  it('returns alerts with correct structure', async () => {
    const { GET } = await import('./route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost:3000/api/alerts', {
      headers: { Authorization: 'Bearer valid-token' },
    });

    const res = await GET(req);
    const data = await res.json();
    const alert = data[0];

    expect(alert).toHaveProperty('id');
    expect(alert).toHaveProperty('crane_id');
    expect(alert).toHaveProperty('timestamp');
    expect(alert).toHaveProperty('level');
    expect(alert).toHaveProperty('title');
    expect(alert).toHaveProperty('description');
    expect(alert).toHaveProperty('acknowledged');
    expect(alert).toHaveProperty('acknowledgement_required');
  });

  it('returns empty array for non-matching filter', async () => {
    const { GET } = await import('./route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost:3000/api/alerts?level=debug', {
      headers: { Authorization: 'Bearer valid-token' },
    });

    const res = await GET(req);
    const data = await res.json();
    expect(data).toEqual([]);
  });
});
