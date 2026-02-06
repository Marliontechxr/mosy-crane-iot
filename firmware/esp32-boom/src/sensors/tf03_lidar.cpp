/**
 * tf03_lidar.cpp — TF03-100 LiDAR UART driver.
 * Blueprint Section 7 — 9-byte frame parsing with checksum validation.
 */
#include "tf03_lidar.h"
#include "../config.h"

LidarReading tf03_parse_frame(const uint8_t* frame) {
  LidarReading reading = {0, 0, false};

  // Validate header bytes
  if (frame[0] != LIDAR_HEADER || frame[1] != LIDAR_HEADER) {
    return reading;
  }

  // Verify checksum: sum of bytes 0-7, low 8 bits
  uint8_t checksum = 0;
  for (int i = 0; i < LIDAR_FRAME_LEN - 1; i++) {
    checksum += frame[i];
  }
  if (checksum != frame[LIDAR_FRAME_LEN - 1]) {
    return reading;
  }

  // Extract distance (little-endian, bytes 2-3) in cm, convert to mm
  uint16_t distance_cm = (uint16_t)frame[2] | ((uint16_t)frame[3] << 8);
  reading.distance_mm = (int32_t)distance_cm * 10;

  // Extract signal strength (bytes 4-5)
  uint16_t strength = (uint16_t)frame[4] | ((uint16_t)frame[5] << 8);
  reading.signal_strength = (strength > 100) ? 100 : (uint8_t)strength;

  reading.valid = true;
  return reading;
}

const char* tf03_status_string(const LidarReading& reading) {
  if (!reading.valid) return "out_of_range";
  if (reading.signal_strength < 20) return "weak";
  return "good";
}

#ifndef NATIVE_TEST
void tf03_init(HardwareSerial& serial, int rx_pin, int tx_pin, long baud) {
  serial.begin(baud, SERIAL_8N1, rx_pin, tx_pin);
}

LidarReading tf03_read(HardwareSerial& serial) {
  LidarReading reading = {0, 0, false};
  uint8_t frame[LIDAR_FRAME_LEN];

  // Scan for header bytes in UART buffer
  while (serial.available() >= LIDAR_FRAME_LEN) {
    uint8_t byte = serial.read();
    if (byte != LIDAR_HEADER) continue;

    // Check for second header byte
    if (serial.available() < LIDAR_FRAME_LEN - 1) break;
    uint8_t next = serial.peek();
    if (next != LIDAR_HEADER) continue;

    // Read complete frame
    frame[0] = byte;
    for (int i = 1; i < LIDAR_FRAME_LEN; i++) {
      frame[i] = serial.read();
    }

    reading = tf03_parse_frame(frame);
    if (reading.valid) break;
  }

  return reading;
}
#endif
