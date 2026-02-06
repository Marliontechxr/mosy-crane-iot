// =============================================================================
// MOSY — processAlert Unit Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AlertMessage } from '@mosy/shared-types';

const {
  mockCreate,
  mockUploadDeadLetter,
  mockSendWhatsApp,
  mockSendSms,
  mockSupervisorCall,
} = vi.hoisted(() => ({
  mockCreate: vi.fn().mockResolvedValue({}),
  mockUploadDeadLetter: vi.fn().mockResolvedValue(undefined),
  mockSendWhatsApp: vi.fn().mockResolvedValue(undefined),
  mockSendSms: vi.fn().mockResolvedValue(undefined),
  mockSupervisorCall: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../shared/cosmos-client.js', () => ({
  getContainer: vi.fn(() => ({
    items: { create: mockCreate },
  })),
}));

vi.mock('../shared/blob-client.js', () => ({
  uploadDeadLetter: mockUploadDeadLetter,
}));

vi.mock('../shared/notifications.js', () => ({
  sendWhatsAppAlert: (...args: unknown[]) => mockSendWhatsApp(...args),
  sendSmsAlert: (...args: unknown[]) => mockSendSms(...args),
  initiateSupervisorCall: (...args: unknown[]) => mockSupervisorCall(...args),
}));

vi.mock('../shared/signalr-client.js', () => ({
  buildBroadcastMessage: vi.fn((target: string, payload: unknown) => ({
    target,
    arguments: [payload],
  })),
}));

vi.mock('@azure/functions', () => ({
  app: { generic: vi.fn(), http: vi.fn(), timer: vi.fn() },
  output: { generic: vi.fn(() => ({})) },
  input: { generic: vi.fn(() => ({})) },
}));

import processAlert from '../functions/processAlert.js';

function createMockContext() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    extraOutputs: { set: vi.fn() },
    extraInputs: { get: vi.fn() },
  } as unknown as Parameters<typeof processAlert>[1];
}

function createAlert(level: 'info' | 'warning' | 'critical'): AlertMessage {
  return {
    timestamp: Date.now(),
    crane_id: 'CRANE-001',
    alert_id: `alert-${level}-001`,
    level,
    type: 'load_limit',
    title: `Test ${level} Alert`,
    description: `Test ${level} alert description`,
    source: 'ocr',
    values: { current_load: 21.0, max_load: 20.0 },
    acknowledgement_required: level === 'critical',
    auto_recovery: false,
    actions: ['halt_operations'],
  };
}

describe('processAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should store alert in Cosmos DB', async () => {
    const context = createMockContext();
    const alert = createAlert('warning');

    await processAlert(alert, context);

    expect(mockCreate).toHaveBeenCalledOnce();
    const doc = mockCreate.mock.calls[0][0];
    expect(doc.craneId).toBe('CRANE-001');
    expect(doc.level).toBe('warning');
    expect(doc.acknowledged).toBe(false);
  });

  it('should escalate critical alert via WhatsApp + SMS + call', async () => {
    const context = createMockContext();
    const alert = createAlert('critical');

    await processAlert(alert, context);

    expect(mockSendWhatsApp).toHaveBeenCalledOnce();
    expect(mockSendSms).toHaveBeenCalledOnce();
    expect(mockSupervisorCall).toHaveBeenCalledOnce();
  });

  it('should send WhatsApp only for warning alerts', async () => {
    const context = createMockContext();
    const alert = createAlert('warning');

    await processAlert(alert, context);

    expect(mockSendWhatsApp).toHaveBeenCalledOnce();
    expect(mockSendSms).not.toHaveBeenCalled();
    expect(mockSupervisorCall).not.toHaveBeenCalled();
  });

  it('should only log info alerts', async () => {
    const context = createMockContext();
    const alert = createAlert('info');

    await processAlert(alert, context);

    expect(mockSendWhatsApp).not.toHaveBeenCalled();
    expect(mockSendSms).not.toHaveBeenCalled();
    expect(mockSupervisorCall).not.toHaveBeenCalled();
    expect(context.log).toHaveBeenCalledWith(expect.stringContaining('Info alert logged'));
  });

  it('should broadcast all alerts to SignalR', async () => {
    const context = createMockContext();
    const alert = createAlert('critical');

    await processAlert(alert, context);

    expect(context.extraOutputs.set).toHaveBeenCalled();
  });

  it('should reject invalid alert messages', async () => {
    const context = createMockContext();
    await processAlert({}, context);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(context.error).toHaveBeenCalledWith(
      expect.stringContaining('Invalid alert message')
    );
  });

  it('should dead-letter on Cosmos failure', async () => {
    const context = createMockContext();
    const alert = createAlert('critical');
    mockCreate.mockRejectedValueOnce(new Error('DB error'));

    await processAlert(alert, context);

    expect(mockUploadDeadLetter).toHaveBeenCalledWith(
      'processAlert',
      alert.alert_id,
      alert,
      expect.any(Error)
    );
  });
});
