/**
 * Telemetry store — fused telemetry, alerts, operator state from MQTT.
 * Blueprint Section 12 — Zustand state management.
 */
import { create } from 'zustand';
import type { FusedTelemetry, AlertMessage, AlertLevel } from '@mosy/shared-types';

interface OperatorInfo {
  id: string;
  name: string;
  faceUrl?: string;
  shiftStart: number;
}

interface TelemetryState {
  /** Current crane ID the tablet is monitoring. */
  craneId: string;
  /** Latest fused telemetry from MQTT. */
  telemetry: FusedTelemetry | null;
  /** Active alerts. */
  alerts: AlertMessage[];
  /** Total unacknowledged critical/warning alerts. */
  alertCount: number;
  /** Highest active alert level. */
  maxAlertLevel: AlertLevel | null;
  /** MQTT broker connection status. */
  mqttConnected: boolean;
  /** Operator info for current session. */
  operator: OperatorInfo;
  /** LiDAR ground clearance in meters. */
  groundClearanceM: number;

  setCraneId: (id: string) => void;
  updateTelemetry: (data: FusedTelemetry) => void;
  addAlert: (alert: AlertMessage) => void;
  dismissAlert: (alertId: string) => void;
  setMqttConnected: (connected: boolean) => void;
  setOperator: (info: OperatorInfo) => void;
}

export const useTelemetryStore = create<TelemetryState>((set) => ({
  craneId: 'CRANE-001',
  telemetry: null,
  alerts: [],
  alertCount: 0,
  maxAlertLevel: null,
  mqttConnected: false,
  operator: {
    id: 'OP-001',
    name: 'Rajesh Kumar',
    shiftStart: Date.now(),
  },
  groundClearanceM: 0,

  setCraneId: (id) => set({ craneId: id }),

  updateTelemetry: (data) =>
    set({
      telemetry: data,
      groundClearanceM: data.position.boom_distance_m,
    }),

  addAlert: (alert) =>
    set((state) => {
      const alerts = [alert, ...state.alerts].slice(0, 50);
      const activeAlerts = alerts.filter(
        (a) => a.level === 'critical' || a.level === 'warning'
      );
      const maxLevel = alerts.find((a) => a.level === 'critical')
        ? 'critical'
        : alerts.find((a) => a.level === 'warning')
          ? 'warning'
          : alerts.length > 0
            ? 'info'
            : null;
      return {
        alerts,
        alertCount: activeAlerts.length,
        maxAlertLevel: maxLevel,
      };
    }),

  dismissAlert: (alertId) =>
    set((state) => {
      const alerts = state.alerts.filter((a) => a.alert_id !== alertId);
      const activeAlerts = alerts.filter(
        (a) => a.level === 'critical' || a.level === 'warning'
      );
      return { alerts, alertCount: activeAlerts.length };
    }),

  setMqttConnected: (connected) => set({ mqttConnected: connected }),

  setOperator: (info) => set({ operator: info }),
}));
