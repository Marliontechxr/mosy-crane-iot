/**
 * mqtt_publisher.h — WiFi and MQTT connectivity for boom unit.
 * Blueprint Section 7 — connects to Jetson broker at 192.168.4.1:1883.
 */
#pragma once

#ifndef NATIVE_TEST

#include <WiFi.h>
#include <PubSubClient.h>
#include "../sensors/tf03_lidar.h"
#include "../sensors/bno055_imu.h"
#include "../sensors/ld2410_radar.h"
#include "../sensors/jlfs2_anemometer.h"

/** Initialize WiFi connection to crane network. */
bool mqtt_wifi_connect(const char* ssid, const char* password, unsigned long timeout_ms);

/** Initialize MQTT client and connect to broker. */
bool mqtt_connect(const char* broker, uint16_t port, const char* client_id);

/** Reconnect to MQTT broker if disconnected. Returns true if connected. */
bool mqtt_ensure_connected();

/** Publish a boom telemetry message. Returns true on success. */
bool mqtt_publish_telemetry(
  const char* topic,
  const char* crane_id,
  uint32_t sequence,
  const LidarReading& lidar,
  const ImuReading& imu,
  const RadarReading& radar
);

/** Process MQTT client loop. Call regularly. */
void mqtt_loop();

/** Check if MQTT is connected. */
bool mqtt_is_connected();

/** Get WiFi RSSI for diagnostics. */
int32_t mqtt_wifi_rssi();

#endif
