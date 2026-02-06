/**
 * MQTT connection hook — connects to Jetson Mosquitto broker over WebSocket.
 * Blueprint Section 12 — tablet PWA connects directly to edge broker.
 * This is the PRIMARY data source, not cloud API.
 */
import { useEffect, useRef } from 'react';
import mqtt, { type MqttClient } from 'mqtt';
import { useTelemetryStore } from '@/stores/telemetry-store';
import { cacheTelemetry } from '@/lib/offline-db';
import type { FusedTelemetry, AlertMessage } from '@mosy/shared-types';

/** Jetson Mosquitto broker WebSocket URL. */
const BROKER_URL = 'ws://192.168.4.1:9001';

/** Reconnect interval in ms. */
const RECONNECT_PERIOD = 5000;

/**
 * Connect to the Jetson's Mosquitto MQTT broker and subscribe to
 * fused telemetry and alert topics. Updates Zustand store on each message.
 */
export function useMqttConnection(): void {
  const clientRef = useRef<MqttClient | null>(null);
  const craneId = useTelemetryStore((s) => s.craneId);
  const updateTelemetry = useTelemetryStore((s) => s.updateTelemetry);
  const addAlert = useTelemetryStore((s) => s.addAlert);
  const setMqttConnected = useTelemetryStore((s) => s.setMqttConnected);

  useEffect(() => {
    const client = mqtt.connect(BROKER_URL, {
      clientId: `mosy-tablet-${craneId}-${Date.now()}`,
      reconnectPeriod: RECONNECT_PERIOD,
      connectTimeout: 10000,
      clean: true,
    });

    clientRef.current = client;

    const fusedTopic = `mosy/${craneId}/telemetry/fused`;
    const alertTopic = `mosy/${craneId}/alerts/+`;

    client.on('connect', () => {
      setMqttConnected(true);
      client.subscribe([fusedTopic, alertTopic], { qos: 1 }, (err) => {
        if (err) {
          console.error('[MQTT] Subscribe error:', err);
        }
      });
    });

    client.on('close', () => {
      setMqttConnected(false);
    });

    client.on('error', (err) => {
      console.error('[MQTT] Connection error:', err);
    });

    client.on('message', (topic: string, payload: Buffer) => {
      try {
        const data = JSON.parse(payload.toString());

        if (topic === fusedTopic) {
          const telemetry = data as FusedTelemetry;
          updateTelemetry(telemetry);
          // Cache for offline access — fire and forget
          cacheTelemetry(telemetry).catch(() => {});
        } else if (topic.startsWith(`mosy/${craneId}/alerts/`)) {
          const alert = data as AlertMessage;
          addAlert(alert);
        }
      } catch (err) {
        console.error('[MQTT] Parse error:', err);
      }
    });

    return () => {
      client.end(true);
      clientRef.current = null;
    };
  }, [craneId, updateTelemetry, addAlert, setMqttConnected]);
}
