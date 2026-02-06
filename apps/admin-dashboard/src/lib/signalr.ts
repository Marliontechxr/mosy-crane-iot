'use client';

/**
 * SignalR client — real-time connection to Azure SignalR Service.
 * Subscribes to telemetry, alert, and state change events.
 */
import * as signalR from '@microsoft/signalr';
import type {
  TelemetryUpdateEvent,
  AlertNotificationEvent,
  StateChangeEvent,
  TelemetryPoint,
  AlertListItem,
} from '@mosy/shared-types';
import { useCraneStore } from '@/stores/crane-store';
import { useAlertStore } from '@/stores/alert-store';

let connection: signalR.HubConnection | null = null;

/** Connect to SignalR hub using negotiate endpoint. */
export async function connectSignalR(getToken: () => Promise<string>): Promise<void> {
  if (connection?.state === signalR.HubConnectionState.Connected) return;

  try {
    const token = await getToken();
    const negotiateRes = await fetch('/api/signalr/negotiate', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!negotiateRes.ok) throw new Error('SignalR negotiate failed');
    const { url, accessToken } = await negotiateRes.json();

    connection = new signalR.HubConnectionBuilder()
      .withUrl(url, { accessTokenFactory: () => accessToken })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (retryContext) => {
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
          const delay = Math.min(1000 * Math.pow(2, retryContext.previousRetryCount), 30000);
          return delay;
        },
      })
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    // Register event handlers
    connection.on('telemetryUpdate', (event: TelemetryUpdateEvent) => {
      const store = useCraneStore.getState();
      if (store.selectedCrane?.id === event.craneId) {
        const point: TelemetryPoint = {
          timestamp: event.timestamp,
          load_tonnes: event.data.load_tonnes,
          boom_angle: event.data.boom_angle,
          boom_distance_m: 0,
          wind_speed_kmh: event.data.wind_speed_kmh,
          operator_perclos: event.data.operator_perclos,
          status: 'valid',
        };
        store.pushTelemetry(point);
      }
      // Update fleet status
      store.updateCraneStatus(event.craneId, {
        current_load_tonnes: event.data.load_tonnes,
        last_telemetry_ms_ago: 0,
      });
    });

    connection.on('alertNotification', (event: AlertNotificationEvent) => {
      const alert: AlertListItem = {
        id: event.alertId,
        crane_id: event.craneId,
        timestamp: event.timestamp,
        level: event.level,
        title: event.title,
        description: '',
        acknowledged: false,
        acknowledgement_required: event.level !== 'info',
      };
      useAlertStore.getState().addAlert(alert);
    });

    connection.on('stateChange', (_event: StateChangeEvent) => {
      // State changes can trigger fleet refresh
    });

    connection.onreconnecting(() => {
      console.warn('[SignalR] Reconnecting...');
    });

    connection.onreconnected(() => {
      console.info('[SignalR] Reconnected');
    });

    connection.onclose(() => {
      console.warn('[SignalR] Connection closed');
    });

    await connection.start();
    console.info('[SignalR] Connected');
  } catch (error) {
    console.error('[SignalR] Connection failed:', error);
  }
}

/** Disconnect from SignalR. */
export async function disconnectSignalR(): Promise<void> {
  if (connection) {
    await connection.stop();
    connection = null;
  }
}

/** Get current connection state. */
export function getSignalRState(): string {
  return connection?.state ?? 'Disconnected';
}
