/**
 * main.cpp — MOSY ESP32-S3 Boom Sensor Unit entry point.
 * Blueprint Section 7 — FreeRTOS tasks for sensor reading and MQTT publishing.
 *
 * Architecture:
 *   Core 0: sensor_read_task — reads LiDAR, IMU, radar, anemometer at 10Hz
 *   Core 1: mqtt_publish_task — serializes and publishes JSON to MQTT at 10Hz
 *
 * Watchdog: Reboots if no successful MQTT publish for 30 seconds.
 * Deep sleep: Enters deep sleep if no engine vibration for 10 minutes.
 */
#include <Arduino.h>
#include <esp_task_wdt.h>
#include "config.h"
#include "sensors/tf03_lidar.h"
#include "sensors/bno055_imu.h"
#include "sensors/ld2410_radar.h"
#include "sensors/jlfs2_anemometer.h"
#include "comms/mqtt_publisher.h"
#include "comms/espnow_fallback.h"

// Shared sensor data protected by mutex
static SemaphoreHandle_t sensorMutex;
static LidarReading latestLidar = {};
static ImuReading latestImu = {};
static RadarReading latestRadar = {};
static AnemometerReading latestWind = {};

static volatile uint32_t sequence = 0;
static volatile unsigned long lastPublishMs = 0;
static volatile bool engineRunning = false;
static volatile unsigned long lastVibrationMs = 0;

// UART instances for sensors
static HardwareSerial LidarSerial(2);  // UART2
static HardwareSerial RadarSerial(1);  // UART1

/**
 * Sensor read task — runs on Core 0 at 10Hz.
 * Reads all four sensors and stores results behind a mutex.
 */
void sensor_read_task(void* pvParameters) {
  (void)pvParameters;

  TickType_t xLastWakeTime = xTaskGetTickCount();

  for (;;) {
    // Read all sensors
    LidarReading lidar = tf03_read(LidarSerial);
    ImuReading imu = bno055_read();
    RadarReading radar = ld2410_read(RadarSerial);
    AnemometerReading wind = anemometer_read(ANEMOMETER_PIN);

    // Detect engine vibration from accelerometer
    if (imu.valid) {
      float accel_mag = sqrt(imu.accel_x * imu.accel_x +
                              imu.accel_y * imu.accel_y +
                              imu.accel_z * imu.accel_z);
      // Engine vibration: accel magnitude deviation from 9.81 m/s²
      if (abs(accel_mag - 9.81f) > 0.3f) {
        lastVibrationMs = millis();
        engineRunning = true;
      }
    }

    // Update shared state
    if (xSemaphoreTake(sensorMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
      if (lidar.valid) latestLidar = lidar;
      if (imu.valid) latestImu = imu;
      if (radar.valid) latestRadar = radar;
      latestWind = wind;
      xSemaphoreGive(sensorMutex);
    }

    // 10Hz timing
    vTaskDelayUntil(&xLastWakeTime, pdMS_TO_TICKS(SENSOR_READ_INTERVAL_MS));
  }
}

/**
 * MQTT publish task — runs on Core 1 at 10Hz.
 * Reads shared sensor state and publishes JSON to MQTT.
 */
void mqtt_publish_task(void* pvParameters) {
  (void)pvParameters;

  TickType_t xLastWakeTime = xTaskGetTickCount();

  for (;;) {
    // Ensure MQTT connectivity
    if (!mqtt_ensure_connected()) {
      // LED blink pattern for disconnected state
      digitalWrite(LED_PIN, (millis() / 250) % 2);
      vTaskDelayUntil(&xLastWakeTime, pdMS_TO_TICKS(MQTT_PUBLISH_INTERVAL_MS));
      continue;
    }

    // Solid LED when connected
    digitalWrite(LED_PIN, HIGH);

    // Snapshot sensor data
    LidarReading lidar;
    ImuReading imu;
    RadarReading radar;

    if (xSemaphoreTake(sensorMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
      lidar = latestLidar;
      imu = latestImu;
      radar = latestRadar;
      xSemaphoreGive(sensorMutex);
    }

    // Publish
    sequence++;
    bool published = mqtt_publish_telemetry(
      MQTT_TOPIC_BOOM, CRANE_ID, sequence, lidar, imu, radar
    );

    if (published) {
      lastPublishMs = millis();
    }

    mqtt_loop();

    // 10Hz timing
    vTaskDelayUntil(&xLastWakeTime, pdMS_TO_TICKS(MQTT_PUBLISH_INTERVAL_MS));
  }
}

/**
 * Check watchdog conditions and deep sleep.
 */
void check_health() {
  unsigned long now = millis();

  // Watchdog: reboot if no publish for 30 seconds
  if (lastPublishMs > 0 && (now - lastPublishMs) > (WATCHDOG_TIMEOUT_S * 1000UL)) {
    Serial.println("[WDT] No publish for 30s — rebooting");
    ESP.restart();
  }

  // Deep sleep: if no vibration for 10 minutes (engine off)
  if (lastVibrationMs > 0 && (now - lastVibrationMs) > (DEEP_SLEEP_IDLE_MIN * 60 * 1000UL)) {
    Serial.println("[POWER] No vibration for 10 min — entering deep sleep");
    esp_deep_sleep(60 * 1000000ULL); // Wake every 60s to check
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("[MOSY] Boom Unit " DEVICE_ID " starting...");

  // Status LED
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Initialize sensors
  tf03_init(LidarSerial, LIDAR_RX_PIN, LIDAR_TX_PIN, LIDAR_BAUD);
  Serial.println("[INIT] LiDAR TF03-100 initialized");

  if (bno055_init(IMU_I2C_ADDR, IMU_SDA_PIN, IMU_SCL_PIN, IMU_I2C_FREQ)) {
    Serial.println("[INIT] IMU BNO055 initialized");
  } else {
    Serial.println("[INIT] IMU BNO055 FAILED — continuing without IMU");
  }

  ld2410_init(RadarSerial, RADAR_RX_PIN, RADAR_TX_PIN, RADAR_BAUD);
  Serial.println("[INIT] Radar LD2410 initialized");

  anemometer_init(ANEMOMETER_PIN);
  Serial.println("[INIT] Anemometer JL-FS2 initialized");

  // Connect WiFi
  Serial.print("[WIFI] Connecting to " WIFI_SSID "...");
  if (mqtt_wifi_connect(WIFI_SSID, WIFI_PASSWORD, WIFI_TIMEOUT_MS)) {
    Serial.println(" connected");
    Serial.print("[WIFI] IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(" FAILED — will retry in MQTT task");
  }

  // Connect MQTT
  if (mqtt_connect(MQTT_BROKER, MQTT_PORT, MQTT_CLIENT_ID)) {
    Serial.println("[MQTT] Connected to " MQTT_BROKER);
  } else {
    Serial.println("[MQTT] Connection failed — will retry");
  }

  // Initialize ESP-NOW fallback
  uint8_t peer_mac[] = ESPNOW_PEER_MAC;
  if (espnow_init(peer_mac, ESPNOW_CHANNEL)) {
    Serial.println("[ESPNOW] Fallback initialized");
  }

  // Create mutex
  sensorMutex = xSemaphoreCreateMutex();

  // Record boot time for watchdog
  lastPublishMs = millis();
  lastVibrationMs = millis();

  // Create FreeRTOS tasks
  xTaskCreatePinnedToCore(
    sensor_read_task,
    "SensorRead",
    SENSOR_TASK_STACK,
    NULL,
    SENSOR_TASK_PRIO,
    NULL,
    SENSOR_TASK_CORE
  );

  xTaskCreatePinnedToCore(
    mqtt_publish_task,
    "MqttPublish",
    MQTT_TASK_STACK,
    NULL,
    MQTT_TASK_PRIO,
    NULL,
    MQTT_TASK_CORE
  );

  Serial.println("[MOSY] Boom unit ready — sensors at 10Hz, MQTT at 10Hz");
}

void loop() {
  // Health monitoring runs in Arduino loop (lower priority)
  check_health();
  delay(1000);
}
