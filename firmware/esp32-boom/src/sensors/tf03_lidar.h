/**
 * tf03_lidar.h — TF03-100 LiDAR driver for distance measurement.
 * Blueprint Section 7 — UART at 115200, 9-byte frames with 0x59 header.
 */
#pragma once

#include <cstdint>

/** LiDAR reading result. */
struct LidarReading {
  int32_t distance_mm;      // Distance in millimeters
  uint8_t signal_strength;  // Signal strength 0-100
  bool valid;               // Whether the reading is valid
};

/**
 * Parse a 9-byte TF03-100 frame.
 * Frame format: [0x59][0x59][dist_lo][dist_hi][strength_lo][strength_hi][reserved][quality][checksum]
 * Checksum = sum of bytes 0-7 (low 8 bits).
 *
 * @param frame Pointer to 9-byte frame buffer
 * @return Parsed reading with validity flag
 */
LidarReading tf03_parse_frame(const uint8_t* frame);

/**
 * Determine LiDAR status string from reading.
 * @return "good", "weak", or "out_of_range"
 */
const char* tf03_status_string(const LidarReading& reading);

#ifndef NATIVE_TEST
#include <HardwareSerial.h>

/** Initialize UART2 for TF03-100 LiDAR. */
void tf03_init(HardwareSerial& serial, int rx_pin, int tx_pin, long baud);

/** Try to read a complete frame from the UART buffer. Non-blocking. */
LidarReading tf03_read(HardwareSerial& serial);
#endif
