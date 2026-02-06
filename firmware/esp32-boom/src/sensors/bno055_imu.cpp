/**
 * bno055_imu.cpp — BNO055 IMU I2C driver.
 * Blueprint Section 7 — reads Euler, accel, gyro, mag, temperature.
 */
#include "bno055_imu.h"
#include "../config.h"

void bno055_convert_euler(
  int16_t heading_raw, int16_t roll_raw, int16_t pitch_raw,
  float& euler_yaw, float& euler_roll, float& euler_pitch
) {
  // BNO055 outputs Euler angles in 1/16 degree units
  euler_yaw = (float)heading_raw / 16.0f;
  euler_roll = (float)roll_raw / 16.0f;
  euler_pitch = (float)pitch_raw / 16.0f;
}

#ifndef NATIVE_TEST
#include <Wire.h>

static Adafruit_BNO055 bno(55, IMU_I2C_ADDR, &Wire);
static bool initialized = false;

bool bno055_init(uint8_t address, int sda_pin, int scl_pin, uint32_t freq) {
  Wire.begin(sda_pin, scl_pin);
  Wire.setClock(freq);

  if (!bno.begin()) {
    return false;
  }

  bno.setExtCrystalUse(true);
  initialized = true;
  return true;
}

ImuReading bno055_read() {
  ImuReading reading = {};
  reading.valid = false;

  if (!initialized) return reading;

  // Euler angles
  sensors_event_t orientationData;
  bno.getEvent(&orientationData, Adafruit_BNO055::VECTOR_EULER);
  reading.euler_yaw = orientationData.orientation.x;
  reading.euler_pitch = orientationData.orientation.y;
  reading.euler_roll = orientationData.orientation.z;

  // Accelerometer
  sensors_event_t accelData;
  bno.getEvent(&accelData, Adafruit_BNO055::VECTOR_ACCELEROMETER);
  reading.accel_x = accelData.acceleration.x;
  reading.accel_y = accelData.acceleration.y;
  reading.accel_z = accelData.acceleration.z;

  // Gyroscope
  sensors_event_t gyroData;
  bno.getEvent(&gyroData, Adafruit_BNO055::VECTOR_GYROSCOPE);
  reading.gyro_x = gyroData.gyro.x;
  reading.gyro_y = gyroData.gyro.y;
  reading.gyro_z = gyroData.gyro.z;

  // Magnetometer
  sensors_event_t magData;
  bno.getEvent(&magData, Adafruit_BNO055::VECTOR_MAGNETOMETER);
  reading.mag_x = magData.magnetic.x;
  reading.mag_y = magData.magnetic.y;
  reading.mag_z = magData.magnetic.z;

  // Temperature
  reading.temperature = (float)bno.getTemp();

  reading.valid = true;
  return reading;
}

Adafruit_BNO055& bno055_get_sensor() {
  return bno;
}
#endif
