/**
 * bno055_imu.h — BNO055 IMU driver for boom angle and motion detection.
 * Blueprint Section 7 — I2C at 0x29, Euler angles + accelerometer + gyroscope.
 */
#pragma once

#include <cstdint>

/** Full IMU reading from BNO055. */
struct ImuReading {
  float accel_x, accel_y, accel_z;   // m/s²
  float gyro_x, gyro_y, gyro_z;     // rad/s
  float mag_x, mag_y, mag_z;        // µT (microtesla)
  float euler_roll, euler_pitch, euler_yaw; // degrees
  float temperature;                  // °C (BNO055 internal)
  bool valid;
};

/**
 * Compute Euler angles from raw register data (for testing).
 * BNO055 outputs Euler angles in 1/16 degree units.
 *
 * @param heading_raw Raw heading register value (0-5760)
 * @param roll_raw Raw roll register value
 * @param pitch_raw Raw pitch register value
 * @param euler_yaw Output yaw in degrees
 * @param euler_roll Output roll in degrees
 * @param euler_pitch Output pitch in degrees
 */
void bno055_convert_euler(
  int16_t heading_raw, int16_t roll_raw, int16_t pitch_raw,
  float& euler_yaw, float& euler_roll, float& euler_pitch
);

#ifndef NATIVE_TEST
#include <Adafruit_BNO055.h>

/** Initialize BNO055 IMU on I2C bus. Returns true on success. */
bool bno055_init(uint8_t address, int sda_pin, int scl_pin, uint32_t freq);

/** Read all IMU data. Returns reading with valid flag. */
ImuReading bno055_read();

/** Get the Adafruit_BNO055 instance (for diagnostics). */
Adafruit_BNO055& bno055_get_sensor();
#endif
