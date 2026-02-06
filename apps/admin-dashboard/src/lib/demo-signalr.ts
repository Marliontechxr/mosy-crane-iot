'use client';

/**
 * MOSY — Demo SignalR Simulator
 *
 * When DEMO_MODE=true, replaces the real Azure SignalR connection
 * with a local setInterval that generates fake telemetry updates
 * and occasional alert notifications.
 */

import type { TelemetryPoint, AlertListItem } from '@mosy/shared-types';
import { useCraneStore } from '@/stores/crane-store';
import { useAlertStore } from '@/stores/alert-store';

let demoInterval: ReturnType<typeof setInterval> | null = null;
let tickCount = 0;

const DEMO_CRANES = ['DEMO-001', 'DEMO-002', 'DEMO-003'];

const DEMO_ALERT_TITLES = [
  'Load approaching 80% threshold',
  'Wind gust detected (24 km/h)',
  'Operator fatigue warning (PERCLOS 18%)',
  'Ground clearance below 4m',
  'OCR confidence drop (75%)',
];

/** Start the demo SignalR simulator. */
export function startDemoSignalR(): void {
  if (demoInterval) return;

  console.info('[DemoSignalR] Starting demo data simulator');

  demoInterval = setInterval(() => {
    tickCount++;

    const craneStore = useCraneStore.getState();
    const alertStore = useAlertStore.getState();

    // Cycle through cranes
    const craneId = DEMO_CRANES[tickCount % DEMO_CRANES.length];
    const t = tickCount * 0.1;

    // Generate telemetry update
    const loadBase = craneId === 'DEMO-001' ? 35 : craneId === 'DEMO-003' ? 16 : 0;
    const telemetryPoint: TelemetryPoint = {
      timestamp: Date.now(),
      load_tonnes: loadBase + 5 * Math.sin(t) + Math.random() * 2,
      boom_angle: 45 + 8 * Math.sin(t * 0.7),
      boom_distance_m: 18 + 3 * Math.sin(t * 0.5),
      wind_speed_kmh: 15 + 5 * Math.sin(t * 0.3) + Math.random() * 2,
      operator_perclos: 0.05 + 0.05 * Math.abs(Math.sin(t * 0.2)),
      status: 'valid',
    };

    // Push to selected crane's telemetry buffer
    if (craneStore.selectedCrane?.id === craneId) {
      craneStore.pushTelemetry(telemetryPoint);
    }

    // Update fleet status
    craneStore.updateCraneStatus(craneId, {
      current_load_tonnes: telemetryPoint.load_tonnes,
      last_telemetry_ms_ago: 0,
    });

    // Inject an alert every ~30 seconds (every 15th tick at 2s interval)
    if (tickCount % 15 === 0) {
      const alertTitle = DEMO_ALERT_TITLES[Math.floor(Math.random() * DEMO_ALERT_TITLES.length)];
      const level = Math.random() < 0.2 ? 'critical' : Math.random() < 0.5 ? 'warning' : 'info';
      const alert: AlertListItem = {
        id: `DEMO-ALERT-${tickCount}`,
        crane_id: craneId,
        timestamp: Date.now(),
        level: level as 'info' | 'warning' | 'critical',
        title: alertTitle,
        description: `Simulated alert for demo on ${craneId}`,
        acknowledged: false,
        acknowledgement_required: level !== 'info',
      };
      alertStore.addAlert(alert);
    }
  }, 2000);
}

/** Stop the demo SignalR simulator. */
export function stopDemoSignalR(): void {
  if (demoInterval) {
    clearInterval(demoInterval);
    demoInterval = null;
    tickCount = 0;
    console.info('[DemoSignalR] Demo simulator stopped');
  }
}

/** Check if demo mode is enabled (client-side). */
export function isDemoModeClient(): boolean {
  if (typeof window === 'undefined') return false;
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}
