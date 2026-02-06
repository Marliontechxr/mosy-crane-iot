/**
 * Tests for crane-store — fleet data, selected crane, telemetry buffer.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCraneStore } from './crane-store';
import type { TelemetryPoint, FleetCraneSummary } from '@mosy/shared-types';

/** Reset the store between tests. */
function resetStore() {
  useCraneStore.setState({
    fleet: [],
    selectedCrane: null,
    telemetryBuffer: [],
    isLoading: false,
    error: null,
  });
}

describe('CraneStore', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------
  it('has correct initial state', () => {
    const state = useCraneStore.getState();
    expect(state.fleet).toEqual([]);
    expect(state.selectedCrane).toBeNull();
    expect(state.telemetryBuffer).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  // -------------------------------------------------------------------------
  // fetchFleet
  // -------------------------------------------------------------------------
  describe('fetchFleet', () => {
    it('fetches fleet data and updates state', async () => {
      const mockCranes: FleetCraneSummary[] = [
        {
          id: 'CRANE-001',
          name: 'Liebherr LTM 1300',
          status: 'active',
          current_load_tonnes: 12.5,
          load_percent: 42,
          operator_present: true,
          last_telemetry_ms_ago: 1200,
          alert_level: 'info',
        },
      ];

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ cranes: mockCranes }),
      }));

      await useCraneStore.getState().fetchFleet('test-token');

      const state = useCraneStore.getState();
      expect(state.fleet).toEqual(mockCranes);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(fetch).toHaveBeenCalledWith('/api/fleet', {
        headers: { Authorization: 'Bearer test-token' },
      });
    });

    it('sets error on fetch failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }));

      await useCraneStore.getState().fetchFleet('test-token');

      const state = useCraneStore.getState();
      expect(state.fleet).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Fleet fetch failed: 500');
    });

    it('sets error on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      await useCraneStore.getState().fetchFleet('test-token');

      const state = useCraneStore.getState();
      expect(state.error).toBe('Network error');
      expect(state.isLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // selectCrane
  // -------------------------------------------------------------------------
  describe('selectCrane', () => {
    it('loads crane detail and clears telemetry buffer', async () => {
      const mockCrane = {
        id: 'CRANE-001',
        name: 'Liebherr LTM 1300',
        type: 'Mobile Crane',
        max_load: 30,
        status: 'active',
        location: { site: 'Chennai Port', latitude: 13.0827, longitude: 80.2707 },
        current_telemetry: {
          timestamp: Date.now(),
          load_tonnes: 12.5,
          boom_angle: 45,
          wind_speed_kmh: 18,
          operator_perclos: 0.08,
        },
        last_calibration: Date.now() - 86400000,
        firmware: { jetson_version: '1.0.0-rc1', mqtt_client: '1.6.1' },
      };

      // Pre-set some telemetry to verify it gets cleared
      useCraneStore.setState({ telemetryBuffer: [{ timestamp: 1 } as TelemetryPoint] });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockCrane),
      }));

      await useCraneStore.getState().selectCrane('CRANE-001', 'test-token');

      const state = useCraneStore.getState();
      expect(state.selectedCrane).toEqual(mockCrane);
      expect(state.telemetryBuffer).toEqual([]);
      expect(state.isLoading).toBe(false);
    });

    it('sets error when crane fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }));

      await useCraneStore.getState().selectCrane('BAD-ID', 'test-token');

      expect(useCraneStore.getState().error).toBe('Crane fetch failed: 404');
    });
  });

  // -------------------------------------------------------------------------
  // clearSelection
  // -------------------------------------------------------------------------
  describe('clearSelection', () => {
    it('clears selected crane and telemetry buffer', () => {
      useCraneStore.setState({
        selectedCrane: { id: 'CRANE-001' } as never,
        telemetryBuffer: [{ timestamp: 1 } as TelemetryPoint],
      });

      useCraneStore.getState().clearSelection();

      expect(useCraneStore.getState().selectedCrane).toBeNull();
      expect(useCraneStore.getState().telemetryBuffer).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // pushTelemetry
  // -------------------------------------------------------------------------
  describe('pushTelemetry', () => {
    it('appends telemetry point', () => {
      const point: TelemetryPoint = {
        timestamp: Date.now(),
        load_tonnes: 15.0,
        boom_angle: 42,
        boom_distance_m: 22,
        wind_speed_kmh: 14,
        operator_perclos: 0.05,
        status: 'normal',
      };

      useCraneStore.getState().pushTelemetry(point);
      expect(useCraneStore.getState().telemetryBuffer).toHaveLength(1);
      expect(useCraneStore.getState().telemetryBuffer[0]).toEqual(point);
    });

    it('trims buffer at 3600 points', () => {
      // Fill buffer with 3600 points
      const points: TelemetryPoint[] = Array.from({ length: 3600 }, (_, i) => ({
        timestamp: i,
        load_tonnes: 10,
        boom_angle: 45,
        boom_distance_m: 20,
        wind_speed_kmh: 10,
        operator_perclos: 0.05,
        status: 'normal',
      }));
      useCraneStore.setState({ telemetryBuffer: points });

      // Push one more — should trim the oldest
      const newPoint: TelemetryPoint = {
        timestamp: 9999,
        load_tonnes: 25,
        boom_angle: 60,
        boom_distance_m: 30,
        wind_speed_kmh: 20,
        operator_perclos: 0.1,
        status: 'warning',
      };
      useCraneStore.getState().pushTelemetry(newPoint);

      const buffer = useCraneStore.getState().telemetryBuffer;
      expect(buffer.length).toBe(3600);
      expect(buffer[buffer.length - 1]).toEqual(newPoint);
      // Oldest should have been trimmed (timestamp 0 should be gone)
      expect(buffer[0].timestamp).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // updateCraneStatus
  // -------------------------------------------------------------------------
  describe('updateCraneStatus', () => {
    it('updates a specific crane in the fleet', () => {
      const cranes: FleetCraneSummary[] = [
        {
          id: 'CRANE-001',
          name: 'Test',
          status: 'active',
          current_load_tonnes: 10,
          load_percent: 33,
          operator_present: true,
          last_telemetry_ms_ago: 500,
          alert_level: 'info',
        },
        {
          id: 'CRANE-002',
          name: 'Test 2',
          status: 'active',
          current_load_tonnes: 20,
          load_percent: 66,
          operator_present: true,
          last_telemetry_ms_ago: 600,
          alert_level: 'info',
        },
      ];
      useCraneStore.setState({ fleet: cranes });

      useCraneStore.getState().updateCraneStatus('CRANE-001', { load_percent: 88, alert_level: 'warning' });

      const fleet = useCraneStore.getState().fleet;
      expect(fleet[0].load_percent).toBe(88);
      expect(fleet[0].alert_level).toBe('warning');
      // CRANE-002 should be unchanged
      expect(fleet[1].load_percent).toBe(66);
    });

    it('does not modify fleet when crane ID not found', () => {
      const cranes: FleetCraneSummary[] = [{
        id: 'CRANE-001',
        name: 'Test',
        status: 'active',
        current_load_tonnes: 10,
        load_percent: 33,
        operator_present: true,
        last_telemetry_ms_ago: 500,
        alert_level: 'info',
      }];
      useCraneStore.setState({ fleet: cranes });

      useCraneStore.getState().updateCraneStatus('CRANE-999', { load_percent: 99 });

      expect(useCraneStore.getState().fleet[0].load_percent).toBe(33);
    });
  });
});
