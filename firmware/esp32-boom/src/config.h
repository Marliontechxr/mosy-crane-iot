/**
 * config.h — Pin assignments, network config, and constants for MOSY boom unit.
 * Blueprint Section 7 — ESP32-S3 hardware configuration.
 */
#pragma once

// ---------- Device Identity ----------
#define CRANE_ID        "CRANE-001"
#define DEVICE_ID       "boom-unit-001"

// ---------- WiFi ----------
#define WIFI_SSID       "MOSY-CRANE-001"
#define WIFI_PASSWORD   "mosy-crane-iot"
#define WIFI_TIMEOUT_MS 10000

// ---------- MQTT ----------
#define MQTT_BROKER     "192.168.4.1"
#define MQTT_PORT       1883
#define MQTT_TOPIC_BOOM "mosy/" CRANE_ID "/telemetry/boom"
#define MQTT_KEEPALIVE  60
#define MQTT_CLIENT_ID  "boom-" DEVICE_ID

// ---------- Sensor Timing ----------
#define SENSOR_READ_INTERVAL_MS  100   // 10 Hz sampling
#define MQTT_PUBLISH_INTERVAL_MS 100   // 10 Hz publishing
#define WATCHDOG_TIMEOUT_S       30    // Reboot if no publish for 30s
#define DEEP_SLEEP_IDLE_MIN      10    // Deep sleep after 10 min no vibration

// ---------- LiDAR TF03-100 (UART2) ----------
#define LIDAR_TX_PIN    17
#define LIDAR_RX_PIN    18
#define LIDAR_BAUD      115200
#define LIDAR_FRAME_LEN 9
#define LIDAR_HEADER    0x59

// ---------- IMU BNO055 (I2C) ----------
#define IMU_SDA_PIN     8
#define IMU_SCL_PIN     9
#define IMU_I2C_ADDR    0x29
#define IMU_I2C_FREQ    400000

// ---------- Radar HLK-LD2410 (UART1) ----------
#define RADAR_TX_PIN    43
#define RADAR_RX_PIN    44
#define RADAR_BAUD      256000

// ---------- Anemometer JL-FS2 (ADC) ----------
#define ANEMOMETER_PIN  1             // GPIO1 = ADC1_CH0
#define ANEMOMETER_VREF 5.0f          // Reference voltage
#define ANEMOMETER_OFFSET 0.054f      // Voltage offset
#define ANEMOMETER_SCALE 6.59f        // m/s per volt
#define WIND_SPEED_MAX  50.0f         // Max wind speed m/s

// ---------- Status LED ----------
#define LED_PIN         2

// ---------- FreeRTOS ----------
#define SENSOR_TASK_STACK  4096
#define SENSOR_TASK_PRIO   1
#define MQTT_TASK_STACK    4096
#define MQTT_TASK_PRIO     1
#define SENSOR_TASK_CORE   0
#define MQTT_TASK_CORE     1

// ---------- ESP-NOW Fallback ----------
#define ESPNOW_CHANNEL  1
// Jetson WiFi adapter MAC (configure at deployment)
#define ESPNOW_PEER_MAC {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF}
