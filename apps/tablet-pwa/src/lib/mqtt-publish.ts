/**
 * MQTT publish utility — fire-and-forget message publishing to the Jetson broker.
 * Manages a single reusable client connection with automatic reconnect.
 * Offline-safe: publish failures are silently ignored so the app continues.
 */
import mqtt from 'mqtt';

let publishClient: mqtt.MqttClient | null = null;

const BROKER = import.meta.env.VITE_MQTT_BROKER || 'ws://192.168.4.1:9001';

/**
 * Publish a JSON message to the specified MQTT topic.
 * Uses QoS 1 (at-least-once). If the broker is unreachable, the call
 * is silently dropped — offline operation takes priority.
 *
 * @param topic - MQTT topic string (e.g. `mosy/CRANE-001/operator/check-in`)
 * @param payload - JSON-serialisable object to publish
 */
export function publishMessage(topic: string, payload: Record<string, unknown>): void {
  try {
    if (!publishClient || !publishClient.connected) {
      publishClient = mqtt.connect(BROKER, {
        clientId: `mosy-tablet-pub-${Date.now()}`,
        reconnectPeriod: 5000,
      });
    }
    publishClient.publish(topic, JSON.stringify(payload), { qos: 1 });
  } catch {
    // Silent fallback — offline operation continues without MQTT
  }
}
