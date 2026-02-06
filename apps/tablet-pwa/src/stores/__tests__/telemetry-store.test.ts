/**
 * Tests for the telemetry Zustand store.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useTelemetryStore } from '../telemetry-store';
import type { FusedTelemetry, AlertMessage } from '@mosy/shared-types';

function makeTelemetry(overrides: Partial<FusedTelemetry> = {}): FusedTelemetry {
  return {
    timestamp: Date.now(),
    crane_id: 'CRANE-001',
    sequence: 1,
    load: { value_tonnes: 25, source: 'ocr', confidence: 0.95, timestamp_source: Date.now() },
    position: { boom_angle_degrees: 45, boom_distance_m: 12, hook_height_m: 20, source_angle: 'ocr', source_distance: 'lidar', confidence: 0.9 },
    motion: { acceleration_vector: [0, 0, 9.8], angular_velocity: [0, 0, 0], source: 'imu' },
    environment: { wind_speed_kmh: 15, wind_direction_degrees: 180, temperature_c: 35, hazard_zone_motion: false },
    safety_flags: { load_over_limit: false, wind_excessive: false, operator_present: true, operator_drowsy: false, uncommanded_motion: false },
    status: 'valid',
    ...overrides,
  };
}

function makeAlert(overrides: Partial<AlertMessage> = {}): AlertMessage {
  return {
    timestamp: Date.now(),
    crane_id: 'CRANE-001',
    alert_id: `alert-${Date.now()}-${Math.random()}`,
    level: 'warning',
    type: 'load_warning',
    title: 'Load Warning',
    description: 'Load approaching limit',
    source: 'ocr',
    values: { load_percent: 85 },
    acknowledgement_required: true,
    auto_recovery: false,
    ...overrides,
  };
}

describe('useTelemetryStore', () => {
  beforeEach(() => {
    // Reset store state
    useTelemetryStore.setState({
      craneId: 'CRANE-001',
      telemetry: null,
      alerts: [],
      alertCount: 0,
      maxAlertLevel: null,
      mqttConnected: false,
      operator: { id: 'OP-001', name: 'Rajesh Kumar', shiftStart: Date.now() },
      groundClearanceM: 0,
    });
  });

  describe('initial state', () => {
    it('has default crane ID', () => {
      expect(useTelemetryStore.getState().craneId).toBe('CRANE-001');
    });

    it('has null telemetry', () => {
      expect(useTelemetryStore.getState().telemetry).toBeNull();
    });

    it('has empty alerts', () => {
      expect(useTelemetryStore.getState().alerts).toHaveLength(0);
    });

    it('is not connected', () => {
      expect(useTelemetryStore.getState().mqttConnected).toBe(false);
    });
  });

  describe('setCraneId', () => {
    it('updates the crane ID', () => {
      useTelemetryStore.getState().setCraneId('CRANE-002');
      expect(useTelemetryStore.getState().craneId).toBe('CRANE-002');
    });
  });

  describe('updateTelemetry', () => {
    it('sets telemetry data', () => {
      const t = makeTelemetry();
      useTelemetryStore.getState().updateTelemetry(t);
      expect(useTelemetryStore.getState().telemetry).toEqual(t);
    });

    it('updates ground clearance from boom_distance_m', () => {
      const t = makeTelemetry({ position: { boom_angle_degrees: 45, boom_distance_m: 8.5, hook_height_m: 20, source_angle: 'ocr', source_distance: 'lidar', confidence: 0.9 } });
      useTelemetryStore.getState().updateTelemetry(t);
      expect(useTelemetryStore.getState().groundClearanceM).toBe(8.5);
    });
  });

  describe('addAlert', () => {
    it('adds an alert to the list', () => {
      const alert = makeAlert();
      useTelemetryStore.getState().addAlert(alert);
      expect(useTelemetryStore.getState().alerts).toHaveLength(1);
    });

    it('prepends new alerts', () => {
      const a1 = makeAlert({ alert_id: 'first', title: 'First' });
      const a2 = makeAlert({ alert_id: 'second', title: 'Second' });
      useTelemetryStore.getState().addAlert(a1);
      useTelemetryStore.getState().addAlert(a2);
      expect(useTelemetryStore.getState().alerts[0].alert_id).toBe('second');
    });

    it('caps alerts at 50', () => {
      for (let i = 0; i < 55; i++) {
        useTelemetryStore.getState().addAlert(makeAlert({ alert_id: `a-${i}` }));
      }
      expect(useTelemetryStore.getState().alerts.length).toBeLessThanOrEqual(50);
    });

    it('counts critical and warning alerts', () => {
      useTelemetryStore.getState().addAlert(makeAlert({ level: 'critical' }));
      useTelemetryStore.getState().addAlert(makeAlert({ level: 'warning' }));
      useTelemetryStore.getState().addAlert(makeAlert({ level: 'info' }));
      expect(useTelemetryStore.getState().alertCount).toBe(2);
    });

    it('sets maxAlertLevel to critical when present', () => {
      useTelemetryStore.getState().addAlert(makeAlert({ level: 'warning' }));
      useTelemetryStore.getState().addAlert(makeAlert({ level: 'critical' }));
      expect(useTelemetryStore.getState().maxAlertLevel).toBe('critical');
    });

    it('sets maxAlertLevel to warning when no critical', () => {
      useTelemetryStore.getState().addAlert(makeAlert({ level: 'warning' }));
      expect(useTelemetryStore.getState().maxAlertLevel).toBe('warning');
    });

    it('sets maxAlertLevel to info when only info', () => {
      useTelemetryStore.getState().addAlert(makeAlert({ level: 'info' }));
      expect(useTelemetryStore.getState().maxAlertLevel).toBe('info');
    });
  });

  describe('dismissAlert', () => {
    it('removes an alert by ID', () => {
      useTelemetryStore.getState().addAlert(makeAlert({ alert_id: 'dismiss-me' }));
      useTelemetryStore.getState().dismissAlert('dismiss-me');
      expect(useTelemetryStore.getState().alerts).toHaveLength(0);
    });

    it('decrements alert count', () => {
      useTelemetryStore.getState().addAlert(makeAlert({ alert_id: 'a1', level: 'warning' }));
      useTelemetryStore.getState().addAlert(makeAlert({ alert_id: 'a2', level: 'critical' }));
      expect(useTelemetryStore.getState().alertCount).toBe(2);

      useTelemetryStore.getState().dismissAlert('a1');
      expect(useTelemetryStore.getState().alertCount).toBe(1);
    });
  });

  describe('setMqttConnected', () => {
    it('sets connected state', () => {
      useTelemetryStore.getState().setMqttConnected(true);
      expect(useTelemetryStore.getState().mqttConnected).toBe(true);
    });
  });

  describe('setOperator', () => {
    it('updates operator info', () => {
      useTelemetryStore.getState().setOperator({
        id: 'OP-002',
        name: 'Amit Patel',
        shiftStart: 1000,
      });
      expect(useTelemetryStore.getState().operator.name).toBe('Amit Patel');
    });
  });
});
