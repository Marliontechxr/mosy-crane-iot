// =============================================================================
// MOSY — HTTP Function Unit Tests (getFleetStatus, getCraneDetail, getOperatorHistory)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock data stores
const mockQueryResults: Record<string, unknown[]> = {};

vi.mock('../shared/cosmos-client.js', () => ({
  getContainer: vi.fn((key: string) => ({
    items: {
      query: vi.fn(() => ({
        fetchAll: vi.fn(async () => ({
          resources: mockQueryResults[key] ?? [],
        })),
      })),
    },
  })),
}));

vi.mock('@azure/functions', () => ({
  app: { generic: vi.fn(), http: vi.fn(), timer: vi.fn() },
  output: { generic: vi.fn(() => ({})) },
  input: { generic: vi.fn(() => ({})) },
}));

import getFleetStatus from '../functions/getFleetStatus.js';
import getCraneDetail from '../functions/getCraneDetail.js';
import getOperatorHistory from '../functions/getOperatorHistory.js';

function createMockContext() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    extraOutputs: { set: vi.fn() },
    extraInputs: { get: vi.fn() },
  } as unknown as Parameters<typeof getFleetStatus>[1];
}

function createMockRequest(params: Record<string, string> = {}, query: Record<string, string> = {}) {
  return {
    params,
    query: {
      get: (key: string) => query[key] ?? null,
    },
    url: 'http://localhost:7071/api/test',
  } as unknown as Parameters<typeof getFleetStatus>[0];
}

describe('getFleetStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockQueryResults).forEach((k) => delete mockQueryResults[k]);
  });

  it('should return empty fleet when no cranes exist', async () => {
    mockQueryResults['CRANES'] = [];
    const context = createMockContext();
    const request = createMockRequest();

    const result = await getFleetStatus(request, context);

    expect(result.status).toBe(200);
    const body = result.jsonBody as Record<string, unknown>;
    expect(body.total_cranes).toBe(0);
    expect(body.online_count).toBe(0);
  });

  it('should return fleet with cranes', async () => {
    mockQueryResults['CRANES'] = [
      {
        crane_id: 'CRANE-001',
        name: 'Tower 1',
        max_load_tonnes: 20,
        status: 'active',
        location: { site_name: 'Site A', latitude: 13.0, longitude: 79.0 },
      },
    ];
    mockQueryResults['TELEMETRY'] = []; // No telemetry = offline
    mockQueryResults['ALERTS'] = [0]; // COUNT query returns 0

    const context = createMockContext();
    const result = await getFleetStatus(createMockRequest(), context);

    expect(result.status).toBe(200);
    const body = result.jsonBody as Record<string, unknown>;
    expect(body.total_cranes).toBe(1);
    expect(body.offline_count).toBe(1);
  });
});

describe('getCraneDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockQueryResults).forEach((k) => delete mockQueryResults[k]);
  });

  it('should return 400 if craneId is missing', async () => {
    const context = createMockContext();
    const result = await getCraneDetail(createMockRequest({}), context);
    expect(result.status).toBe(400);
  });

  it('should return crane details with defaults when crane not found', async () => {
    mockQueryResults['CRANES'] = [];
    mockQueryResults['TELEMETRY'] = [];

    const context = createMockContext();
    const result = await getCraneDetail(
      createMockRequest({ craneId: 'CRANE-001' }),
      context
    );

    expect(result.status).toBe(200);
    const body = result.jsonBody as Record<string, unknown>;
    expect(body.id).toBe('CRANE-001');
  });
});

describe('getOperatorHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockQueryResults).forEach((k) => delete mockQueryResults[k]);
  });

  it('should return 400 if operatorId is missing', async () => {
    const context = createMockContext();
    const result = await getOperatorHistory(createMockRequest({}), context);
    expect(result.status).toBe(400);
  });

  it('should return empty history for unknown operator', async () => {
    mockQueryResults['OPERATORS'] = [];
    mockQueryResults['SHIFTS'] = [];

    const context = createMockContext();
    const result = await getOperatorHistory(
      createMockRequest({ operatorId: 'OP-001' }),
      context
    );

    expect(result.status).toBe(200);
    const body = result.jsonBody as Record<string, unknown>;
    expect(body.operator_id).toBe('OP-001');
    expect(body.total_shifts).toBe(0);
    expect(body.operator_name).toBe('Unknown');
  });
});
