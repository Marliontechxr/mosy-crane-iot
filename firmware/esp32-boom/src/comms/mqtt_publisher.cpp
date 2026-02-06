/**
 * mqtt_publisher.cpp — WiFi + MQTT connectivity for boom unit.
 * Blueprint Section 7 — publishes BoomTelemetry JSON to Jetson broker.
 */
#ifndef NATIVE_TEST

#include "mqtt_publisher.h"
#include "../config.h"
#include <ArduinoJson.h>

static WiFiClient wifiClient;
static PubSubClient mqttClient(wifiClient);
static unsigned long lastConnectAttempt = 0;

bool mqtt_wifi_connect(const char* ssid, const char* password, unsigned long timeout_ms) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < timeout_ms) {
    delay(100);
  }

  return WiFi.status() == WL_CONNECTED;
}

bool mqtt_connect(const char* broker, uint16_t port, const char* client_id) {
  mqttClient.setServer(broker, port);
  mqttClient.setKeepAlive(MQTT_KEEPALIVE);
  mqttClient.setBufferSize(1024);

  return mqttClient.connect(client_id);
}

bool mqtt_ensure_connected() {
  if (mqttClient.connected()) return true;

  // Rate-limit reconnection attempts
  unsigned long now = millis();
  if (now - lastConnectAttempt < 5000) return false;
  lastConnectAttempt = now;

  // Check WiFi first
  if (WiFi.status() != WL_CONNECTED) {
    mqtt_wifi_connect(WIFI_SSID, WIFI_PASSWORD, WIFI_TIMEOUT_MS);
    if (WiFi.status() != WL_CONNECTED) return false;
  }

  return mqttClient.connect(MQTT_CLIENT_ID);
}

bool mqtt_publish_telemetry(
  const char* topic,
  const char* crane_id,
  uint32_t sequence,
  const LidarReading& lidar,
  const ImuReading& imu,
  const RadarReading& radar
) {
  JsonDocument doc;

  doc["timestamp"] = (double)millis();
  doc["crane_id"] = crane_id;
  doc["sequence"] = sequence;

  // LiDAR
  JsonObject lidar_obj = doc["lidar"].to<JsonObject>();
  lidar_obj["distance_mm"] = lidar.distance_mm;
  lidar_obj["signal_strength"] = lidar.signal_strength;
  lidar_obj["status"] = tf03_status_string(lidar);

  // IMU
  JsonObject imu_obj = doc["imu"].to<JsonObject>();
  imu_obj["accel_x"] = serialized(String(imu.accel_x, 3));
  imu_obj["accel_y"] = serialized(String(imu.accel_y, 3));
  imu_obj["accel_z"] = serialized(String(imu.accel_z, 3));
  imu_obj["gyro_x"] = serialized(String(imu.gyro_x, 4));
  imu_obj["gyro_y"] = serialized(String(imu.gyro_y, 4));
  imu_obj["gyro_z"] = serialized(String(imu.gyro_z, 4));
  imu_obj["mag_x"] = serialized(String(imu.mag_x, 1));
  imu_obj["mag_y"] = serialized(String(imu.mag_y, 1));
  imu_obj["mag_z"] = serialized(String(imu.mag_z, 1));
  imu_obj["euler_roll"] = serialized(String(imu.euler_roll, 1));
  imu_obj["euler_pitch"] = serialized(String(imu.euler_pitch, 1));
  imu_obj["euler_yaw"] = serialized(String(imu.euler_yaw, 1));
  imu_obj["temperature"] = serialized(String(imu.temperature, 1));

  // Radar
  JsonObject radar_obj = doc["radar"].to<JsonObject>();
  radar_obj["motion_detected"] = radar.motion_detected;
  radar_obj["distance_m"] = serialized(String(radar.distance_m, 2));
  radar_obj["target_count"] = radar.target_count;
  radar_obj["presence_status"] = presence_status_string(radar.presence);

  char buffer[768];
  size_t len = serializeJson(doc, buffer, sizeof(buffer));
  if (len == 0) return false;

  return mqttClient.publish(topic, buffer, false);
}

void mqtt_loop() {
  mqttClient.loop();
}

bool mqtt_is_connected() {
  return mqttClient.connected();
}

int32_t mqtt_wifi_rssi() {
  return WiFi.RSSI();
}

#endif
