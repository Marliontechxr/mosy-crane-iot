/**
 * Tests for alert-store — alerts, unread count, filters, acknowledge.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAlertStore } from './alert-store';
import type { AlertListItem } from '@mosy/shared-types';

function resetStore() {
  useAlertStore.setState({
    alerts: [],
    unreadCount: 0,
    filters: {},
    isLoading: false,
  });
}

const mockAlert = (overrides: Partial<AlertListItem> = {}): AlertListItem => ({
  id: 'ALERT-001',
  crane_id: 'CRANE-001',
  timestamp: Date.now(),
  level: 'warning',
  title: 'Load approaching limit',
  description: 'Test alert',
  acknowledged: false,
  acknowledgement_required: true,
  ...overrides,
});

describe('AlertStore', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------
  it('has correct initial state', () => {
    const state = useAlertStore.getState();
    expect(state.alerts).toEqual([]);
    expect(state.unreadCount).toBe(0);
    expect(state.filters).toEqual({});
    expect(state.isLoading).toBe(false);
  });

  // -------------------------------------------------------------------------
  // fetchAlerts
  // -------------------------------------------------------------------------
  describe('fetchAlerts', () => {
    it('fetches alerts and computes unread count', async () => {
      const alerts = [
        mockAlert({ id: 'A1', acknowledged: false }),
        mockAlert({ id: 'A2', acknowledged: true }),
        mockAlert({ id: 'A3', acknowledged: false }),
      ];

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(alerts),
      }));

      await useAlertStore.getState().fetchAlerts('test-token');

      const state = useAlertStore.getState();
      expect(state.alerts).toHaveLength(3);
      expect(state.unreadCount).toBe(2);
      expect(state.isLoading).toBe(false);
    });

    it('sends filter parameters in request', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      }));

      await useAlertStore.getState().fetchAlerts('test-token', {
        level: 'critical',
        craneId: 'CRANE-002',
        acknowledged: false,
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('level=critical'),
        expect.any(Object)
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('crane=CRANE-002'),
        expect.any(Object)
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('acknowledged=false'),
        expect.any(Object)
      );
    });

    it('uses stored filters when none provided', async () => {
      useAlertStore.setState({ filters: { level: 'warning' } });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      }));

      await useAlertStore.getState().fetchAlerts('test-token');

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('level=warning'),
        expect.any(Object)
      );
    });

    it('handles fetch failure gracefully', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }));

      await useAlertStore.getState().fetchAlerts('test-token');

      const state = useAlertStore.getState();
      expect(state.alerts).toEqual([]);
      expect(state.isLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // addAlert
  // -------------------------------------------------------------------------
  describe('addAlert', () => {
    it('prepends new alert and increments unread count', () => {
      const existing = mockAlert({ id: 'OLD', acknowledged: true });
      useAlertStore.setState({ alerts: [existing], unreadCount: 0 });

      const newAlert = mockAlert({ id: 'NEW', acknowledged: false });
      useAlertStore.getState().addAlert(newAlert);

      const state = useAlertStore.getState();
      expect(state.alerts).toHaveLength(2);
      expect(state.alerts[0].id).toBe('NEW');
      expect(state.unreadCount).toBe(1);
    });

    it('does not increment unread for acknowledged alert', () => {
      useAlertStore.setState({ unreadCount: 1 });

      const ackAlert = mockAlert({ id: 'ACK', acknowledged: true });
      useAlertStore.getState().addAlert(ackAlert);

      expect(useAlertStore.getState().unreadCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // acknowledgeAlert
  // -------------------------------------------------------------------------
  describe('acknowledgeAlert', () => {
    it('marks alert as acknowledged and decrements unread', async () => {
      const alerts = [
        mockAlert({ id: 'A1', acknowledged: false }),
        mockAlert({ id: 'A2', acknowledged: false }),
      ];
      useAlertStore.setState({ alerts, unreadCount: 2 });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, acknowledged_at: Date.now() }),
      }));

      await useAlertStore.getState().acknowledgeAlert('A1', 'test-token', 'user-001');

      const state = useAlertStore.getState();
      expect(state.alerts.find((a) => a.id === 'A1')?.acknowledged).toBe(true);
      expect(state.alerts.find((a) => a.id === 'A2')?.acknowledged).toBe(false);
      expect(state.unreadCount).toBe(1);
    });

    it('sends correct POST request', async () => {
      useAlertStore.setState({
        alerts: [mockAlert({ id: 'A1', acknowledged: false })],
        unreadCount: 1,
      });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      }));

      await useAlertStore.getState().acknowledgeAlert('A1', 'my-token', 'user-001');

      expect(fetch).toHaveBeenCalledWith('/api/alerts/A1/acknowledge', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer my-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ acknowledged_by: 'user-001', notes: '' }),
      });
    });

    it('does not update state on failure', async () => {
      useAlertStore.setState({
        alerts: [mockAlert({ id: 'A1', acknowledged: false })],
        unreadCount: 1,
      });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

      await useAlertStore.getState().acknowledgeAlert('A1', 'token', 'user-001');

      expect(useAlertStore.getState().alerts[0].acknowledged).toBe(false);
      expect(useAlertStore.getState().unreadCount).toBe(1);
    });

    it('does not let unreadCount go below zero', async () => {
      useAlertStore.setState({
        alerts: [mockAlert({ id: 'A1', acknowledged: false })],
        unreadCount: 0,
      });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      }));

      await useAlertStore.getState().acknowledgeAlert('A1', 'token', 'user-001');

      expect(useAlertStore.getState().unreadCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // setFilters
  // -------------------------------------------------------------------------
  describe('setFilters', () => {
    it('updates filters', () => {
      useAlertStore.getState().setFilters({ level: 'critical', craneId: 'CRANE-003' });

      const state = useAlertStore.getState();
      expect(state.filters.level).toBe('critical');
      expect(state.filters.craneId).toBe('CRANE-003');
    });

    it('replaces existing filters', () => {
      useAlertStore.setState({ filters: { level: 'critical' } });

      useAlertStore.getState().setFilters({ acknowledged: true });

      const state = useAlertStore.getState();
      expect(state.filters.level).toBeUndefined();
      expect(state.filters.acknowledged).toBe(true);
    });
  });
});
