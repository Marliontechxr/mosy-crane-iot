/**
 * test_sensors.cpp — PlatformIO native tests for ESP32-S3 sensor parsing.
 * Runs on host (not ESP32) with mocked UART/I2C data.
 */
#define NATIVE_TEST

#include <unity.h>
#include <cstring>
#include "../src/config.h"
#include "../src/sensors/tf03_lidar.h"
#include "../src/sensors/tf03_lidar.cpp"
#include "../src/sensors/bno055_imu.h"
#include "../src/sensors/bno055_imu.cpp"
#include "../src/sensors/ld2410_radar.h"
#include "../src/sensors/ld2410_radar.cpp"
#include "../src/sensors/jlfs2_anemometer.h"
#include "../src/sensors/jlfs2_anemometer.cpp"

// ==================== TF03 LiDAR Tests ====================

void test_tf03_valid_frame(void) {
  // Build a valid 9-byte TF03 frame
  // Distance = 345 cm (0x59 0x01), Strength = 95 (0x5F 0x00)
  uint8_t frame[9] = {0x59, 0x59, 0x59, 0x01, 0x5F, 0x00, 0x00, 0x00, 0x00};

  // Compute checksum
  uint8_t cs = 0;
  for (int i = 0; i < 8; i++) cs += frame[i];
  frame[8] = cs;

  LidarReading r = tf03_parse_frame(frame);
  TEST_ASSERT_TRUE(r.valid);
  TEST_ASSERT_EQUAL_INT32(3450, r.distance_mm);  // 345 cm * 10 = 3450 mm
  TEST_ASSERT_EQUAL_UINT8(95, r.signal_strength);
}

void test_tf03_invalid_header(void) {
  uint8_t frame[9] = {0x00, 0x59, 0x59, 0x01, 0x5F, 0x00, 0x00, 0x00, 0x00};
  LidarReading r = tf03_parse_frame(frame);
  TEST_ASSERT_FALSE(r.valid);
}

void test_tf03_bad_checksum(void) {
  uint8_t frame[9] = {0x59, 0x59, 0x59, 0x01, 0x5F, 0x00, 0x00, 0x00, 0xFF};
  LidarReading r = tf03_parse_frame(frame);
  TEST_ASSERT_FALSE(r.valid);
}

void test_tf03_zero_distance(void) {
  uint8_t frame[9] = {0x59, 0x59, 0x00, 0x00, 0x50, 0x00, 0x00, 0x00, 0x00};
  uint8_t cs = 0;
  for (int i = 0; i < 8; i++) cs += frame[i];
  frame[8] = cs;

  LidarReading r = tf03_parse_frame(frame);
  TEST_ASSERT_TRUE(r.valid);
  TEST_ASSERT_EQUAL_INT32(0, r.distance_mm);
}

void test_tf03_max_distance(void) {
  // Max distance: 10000 cm = 100m → 0x10 0x27
  uint8_t frame[9] = {0x59, 0x59, 0x10, 0x27, 0x64, 0x00, 0x00, 0x00, 0x00};
  uint8_t cs = 0;
  for (int i = 0; i < 8; i++) cs += frame[i];
  frame[8] = cs;

  LidarReading r = tf03_parse_frame(frame);
  TEST_ASSERT_TRUE(r.valid);
  TEST_ASSERT_EQUAL_INT32(100000, r.distance_mm);  // 10000 cm * 10
}

void test_tf03_status_good(void) {
  LidarReading r = {3450, 95, true};
  TEST_ASSERT_EQUAL_STRING("good", tf03_status_string(r));
}

void test_tf03_status_weak(void) {
  LidarReading r = {3450, 10, true};
  TEST_ASSERT_EQUAL_STRING("weak", tf03_status_string(r));
}

void test_tf03_status_out_of_range(void) {
  LidarReading r = {0, 0, false};
  TEST_ASSERT_EQUAL_STRING("out_of_range", tf03_status_string(r));
}

void test_tf03_strength_clamped(void) {
  // Strength > 100 should be clamped
  uint8_t frame[9] = {0x59, 0x59, 0x64, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00};
  uint8_t cs = 0;
  for (int i = 0; i < 8; i++) cs += frame[i];
  frame[8] = cs;

  LidarReading r = tf03_parse_frame(frame);
  TEST_ASSERT_TRUE(r.valid);
  TEST_ASSERT_EQUAL_UINT8(100, r.signal_strength);
}

// ==================== BNO055 IMU Tests ====================

void test_bno055_euler_conversion(void) {
  float yaw, roll, pitch;
  // Heading 720 raw = 45.0 degrees (720/16)
  // Roll 160 raw = 10.0 degrees
  // Pitch -80 raw = -5.0 degrees
  bno055_convert_euler(720, 160, -80, yaw, roll, pitch);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 45.0f, yaw);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 10.0f, roll);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, -5.0f, pitch);
}

void test_bno055_euler_zero(void) {
  float yaw, roll, pitch;
  bno055_convert_euler(0, 0, 0, yaw, roll, pitch);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 0.0f, yaw);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 0.0f, roll);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 0.0f, pitch);
}

void test_bno055_euler_full_rotation(void) {
  float yaw, roll, pitch;
  // 360 degrees = 5760 raw
  bno055_convert_euler(5760, 0, 0, yaw, roll, pitch);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 360.0f, yaw);
}

// ==================== LD2410 Radar Tests ====================

void test_radar_no_target(void) {
  RadarReading r = ld2410_parse_target(0, 0, 0, 0, 0);
  TEST_ASSERT_TRUE(r.valid);
  TEST_ASSERT_FALSE(r.motion_detected);
  TEST_ASSERT_EQUAL_UINT8(0, r.target_count);
  TEST_ASSERT_EQUAL_STRING("none", presence_status_string(r.presence));
}

void test_radar_moving_target(void) {
  // target_state=1 (moving), distance=250cm, energy=80
  RadarReading r = ld2410_parse_target(1, 250, 0, 80, 0);
  TEST_ASSERT_TRUE(r.valid);
  TEST_ASSERT_TRUE(r.motion_detected);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 2.5f, r.distance_m);
  TEST_ASSERT_EQUAL_UINT8(1, r.target_count);
  TEST_ASSERT_EQUAL_STRING("moving", presence_status_string(r.presence));
}

void test_radar_stationary_target(void) {
  RadarReading r = ld2410_parse_target(2, 0, 150, 0, 60);
  TEST_ASSERT_TRUE(r.valid);
  TEST_ASSERT_FALSE(r.motion_detected);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 1.5f, r.distance_m);
  TEST_ASSERT_EQUAL_STRING("stationary", presence_status_string(r.presence));
}

void test_radar_both_targets(void) {
  // target_state=3 (both), moving at 300cm, static at 200cm
  RadarReading r = ld2410_parse_target(3, 300, 200, 70, 50);
  TEST_ASSERT_TRUE(r.valid);
  TEST_ASSERT_TRUE(r.motion_detected);
  TEST_ASSERT_EQUAL_UINT8(2, r.target_count);
  // Closest distance should be 200cm (2.0m)
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 2.0f, r.distance_m);
}

// ==================== Anemometer Tests ====================

void test_anemometer_zero_wind(void) {
  // ADC at offset voltage → 0 wind
  // voltage = (adc / 4095) * 5.0 → to get 0.054V: adc = (0.054/5.0)*4095 = 44.2
  AnemometerReading r = anemometer_convert(44, 5.0f, 0.054f, 6.59f, 50.0f);
  TEST_ASSERT_TRUE(r.valid);
  TEST_ASSERT_FLOAT_WITHIN(0.1f, 0.0f, r.wind_speed_ms);
}

void test_anemometer_mid_range(void) {
  // Voltage = 2.0V → speed = (2.0 - 0.054) * 6.59 = 12.82 m/s
  // ADC for 2.0V = (2.0/5.0) * 4095 = 1638
  AnemometerReading r = anemometer_convert(1638, 5.0f, 0.054f, 6.59f, 50.0f);
  TEST_ASSERT_TRUE(r.valid);
  TEST_ASSERT_FLOAT_WITHIN(0.5f, 12.82f, r.wind_speed_ms);
  TEST_ASSERT_FLOAT_WITHIN(2.0f, 46.15f, r.wind_speed_kmh);
}

void test_anemometer_clamp_negative(void) {
  // ADC = 0 → voltage = 0 → speed = (0 - 0.054) * 6.59 = negative → clamped to 0
  AnemometerReading r = anemometer_convert(0, 5.0f, 0.054f, 6.59f, 50.0f);
  TEST_ASSERT_TRUE(r.valid);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 0.0f, r.wind_speed_ms);
}

void test_anemometer_clamp_max(void) {
  // ADC = 4095 → voltage = 5.0V → speed = (5.0 - 0.054) * 6.59 = 32.6 m/s
  AnemometerReading r = anemometer_convert(4095, 5.0f, 0.054f, 6.59f, 50.0f);
  TEST_ASSERT_TRUE(r.valid);
  TEST_ASSERT_TRUE(r.wind_speed_ms <= 50.0f);
}

void test_anemometer_kmh_conversion(void) {
  // 10 m/s = 36 km/h
  // Need voltage for 10 m/s: 10 = (V - 0.054) * 6.59 → V = 1.572
  // ADC = (1.572/5.0) * 4095 = 1287
  AnemometerReading r = anemometer_convert(1287, 5.0f, 0.054f, 6.59f, 50.0f);
  TEST_ASSERT_FLOAT_WITHIN(1.0f, 36.0f, r.wind_speed_kmh);
}

// ==================== Test Runner ====================

int main(void) {
  UNITY_BEGIN();

  // LiDAR
  RUN_TEST(test_tf03_valid_frame);
  RUN_TEST(test_tf03_invalid_header);
  RUN_TEST(test_tf03_bad_checksum);
  RUN_TEST(test_tf03_zero_distance);
  RUN_TEST(test_tf03_max_distance);
  RUN_TEST(test_tf03_status_good);
  RUN_TEST(test_tf03_status_weak);
  RUN_TEST(test_tf03_status_out_of_range);
  RUN_TEST(test_tf03_strength_clamped);

  // IMU
  RUN_TEST(test_bno055_euler_conversion);
  RUN_TEST(test_bno055_euler_zero);
  RUN_TEST(test_bno055_euler_full_rotation);

  // Radar
  RUN_TEST(test_radar_no_target);
  RUN_TEST(test_radar_moving_target);
  RUN_TEST(test_radar_stationary_target);
  RUN_TEST(test_radar_both_targets);

  // Anemometer
  RUN_TEST(test_anemometer_zero_wind);
  RUN_TEST(test_anemometer_mid_range);
  RUN_TEST(test_anemometer_clamp_negative);
  RUN_TEST(test_anemometer_clamp_max);
  RUN_TEST(test_anemometer_kmh_conversion);

  return UNITY_END();
}
