// =============================================================================
// MOSY — processTelemetry Unit Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FusedTelemetry } from '@mosy/shared-types';

const { mockCreate, mockUploadDeadLetter } = vi.hoisted(() => ({
  mockCreate: vi.fn().mockResolvedValue({}),
  mockUploadDeadLetter: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../shared/cosmos-client.js', () => ({
  getContainer: vi.fn(() => ({
    items: { create: mockCreate },
  })),
}));

vi.mock('../shared/blob-client.js', () => ({
  uploadDeadLetter: mockUploadDeadLetter,
}));

vi.mock('@azure/functions', () => ({
  app: { generic: vi.fn(), http: vi.fn(), timer: vi.fn() },
  output: { generic: vi.fn(() => ({})) },
  input: { generic: vi.fn(() => ({})) },
}));

import processTelemetry from '../functions/processTelemetry.js';

function createMockContext() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    extraOutputs: {
      set: vi.fn(),
    },
    extraInputs: {
      get: vi.fn(),
    },
  } as unknown as Parameters<typeof processTelemetry>[1];
}

function createValidTelemetry(): FusedTelemetry {
  return {
    timestamp: Date.now(),
    crane_id: 'CRANE-001',
    sequence: 42,
    load: {
      value_tonnes: 15.5,
      source: 'ocr',
      confidence: 0.95,
      timestamp_source: Date.now(),
    },
    position: {
      boom_angle_degrees: 45.0,
      boom_distance_m: 30.0,
      hook_height_m: 20.0,
      source_angle: 'ocr',
      source_distance: 'lidar',
      confidence: 0.9,
    },
    motion: {
      acceleration_vector: [0.01, -0.02, 9.81],
      angular_velocity: [0.0, 0.0, 0.0],
      source: 'imu',
    },
    environment: {
      wind_speed_kmh: 12.3,
      wind_direction_degrees: 180,
      temperature_c: 32.5,
      hazard_zone_motion: false,
    },
    safety_flags: {
      load_over_limit: false,
      wind_excessive: false,
      operator_present: true,
      operator_drowsy: false,
      uncommanded_motion: false,
    },
    status: 'valid',
  };
}

describe('processTelemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should store valid telemetry in Cosmos DB', async () => {
    const context = createMockContext();
    const telemetry = createValidTelemetry();

    await processTelemetry(telemetry, context);

    expect(mockCreate).toHaveBeenCalledOnce();
    const doc = mockCreate.mock.calls[0][0];
    expect(doc.craneId).toBe('CRANE-001');
    expect(doc.sequence).toBe(42);
    expect(doc.load.value_tonnes).toBe(15.5);
    expect(doc.ttl).toBe(7776000);
    expect(doc.status).toBe('valid');
    expect(context.log).toHaveBeenCalled();
  });

  it('should reject messages without crane_id', async () => {
    const context = createMockContext();
    await processTelemetry({ timestamp: Date.now() }, context);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(context.error).toHaveBeenCalledWith(
      expect.stringContaining('missing crane_id')
    );
  });

  it('should reject messages without timestamp', async () => {
    const context = createMockContext();
    await processTelemetry({ crane_id: 'CRANE-001' }, context);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(context.error).toHaveBeenCalledWith(
      expect.stringContaining('missing crane_id or timestamp')
    );
  });

  it('should dead-letter on Cosmos DB write failure', async () => {
    const context = createMockContext();
    const telemetry = createValidTelemetry();
    mockCreate.mockRejectedValueOnce(new Error('Cosmos write failed'));

    await processTelemetry(telemetry, context);

    expect(context.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to process telemetry')
    );
    expect(mockUploadDeadLetter).toHaveBeenCalledWith(
      'processTelemetry',
      expect.any(String),
      telemetry,
      expect.any(Error)
    );
  });

  it('should map FusedTelemetry motion vectors correctly', async () => {
    const context = createMockContext();
    const telemetry = createValidTelemetry();

    await processTelemetry(telemetry, context);

    const doc = mockCreate.mock.calls[0][0];
    expect(doc.motion.acceleration_x).toBe(0.01);
    expect(doc.motion.acceleration_y).toBe(-0.02);
    expect(doc.motion.acceleration_z).toBe(9.81);
  });
});
