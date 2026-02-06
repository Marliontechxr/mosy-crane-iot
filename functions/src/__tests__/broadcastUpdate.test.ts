// =============================================================================
// MOSY — broadcastUpdate Unit Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@azure/functions', () => ({
  app: { generic: vi.fn(), http: vi.fn(), timer: vi.fn() },
  output: { generic: vi.fn(() => ({})) },
  input: { generic: vi.fn(() => ({})) },
}));

import broadcastUpdate from '../functions/broadcastUpdate.js';

function createMockContext() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    extraOutputs: { set: vi.fn() },
    extraInputs: { get: vi.fn() },
  } as unknown as Parameters<typeof broadcastUpdate>[1];
}

describe('broadcastUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should broadcast telemetry messages to SignalR', async () => {
    const context = createMockContext();
    const message = {
      crane_id: 'CRANE-001',
      timestamp: Date.now(),
      sequence: 1,
      load: { value_tonnes: 15.0, confidence: 0.95 },
      position: { boom_angle_degrees: 45, boom_distance_m: 30, hook_height_m: 20 },
      environment: { wind_speed_kmh: 12 },
      safety_flags: { operator_present: true, operator_drowsy: false },
    };

    await broadcastUpdate(message, context);

    expect(context.extraOutputs.set).toHaveBeenCalledOnce();
    const signalRMessages = context.extraOutputs.set.mock.calls[0][1];
    expect(signalRMessages).toHaveLength(2); // group + broadcast
    expect(signalRMessages[0].target).toBe('telemetryUpdate');
    expect(signalRMessages[0].groupName).toBe('crane-CRANE-001');
  });

  it('should detect and broadcast alert messages', async () => {
    const context = createMockContext();
    const message = {
      crane_id: 'CRANE-001',
      alert_id: 'alert-001',
      timestamp: Date.now(),
      level: 'critical',
      title: 'Load exceeded',
      description: 'Too heavy',
      values: {},
      source: 'ocr',
    };

    await broadcastUpdate(message, context);

    const signalRMessages = context.extraOutputs.set.mock.calls[0][1];
    expect(signalRMessages[0].target).toBe('alertNotification');
  });

  it('should detect and broadcast state change messages', async () => {
    const context = createMockContext();
    const message = {
      crane_id: 'CRANE-001',
      timestamp: Date.now(),
      current_state: 'hoisting',
      previous_state: 'idle',
      state_type: 'lift',
    };

    await broadcastUpdate(message, context);

    const signalRMessages = context.extraOutputs.set.mock.calls[0][1];
    expect(signalRMessages[0].target).toBe('stateChange');
  });

  it('should skip messages without crane_id', async () => {
    const context = createMockContext();
    await broadcastUpdate({ timestamp: Date.now() }, context);

    expect(context.warn).toHaveBeenCalledWith(
      expect.stringContaining('without crane_id')
    );
    expect(context.extraOutputs.set).not.toHaveBeenCalled();
  });
});
