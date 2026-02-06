/**
 * ld2410_radar.h — HLK-LD2410 mmWave radar for proximity detection.
 * Blueprint Section 7 — UART at 256000, presence/motion detection ≤5m.
 */
#pragma once

#include <cstdint>

/** Radar presence status. */
enum class PresenceStatus : uint8_t {
  NONE = 0,
  STATIONARY = 1,
  MOVING = 2,
};

/** Radar reading result. */
struct RadarReading {
  bool motion_detected;
  float distance_m;
  uint8_t target_count;
  PresenceStatus presence;
  bool valid;
};

/**
 * Convert PresenceStatus to string for JSON serialization.
 */
const char* presence_status_string(PresenceStatus status);

/**
 * Parse LD2410 data frame fields.
 * Target data format: [target_state][moving_dist_lo][moving_dist_hi][moving_energy]
 *                     [static_dist_lo][static_dist_hi][static_energy]
 *
 * @param target_state 0=none, 1=moving, 2=stationary, 3=both
 * @param moving_distance Raw moving target distance (cm)
 * @param static_distance Raw static target distance (cm)
 * @param moving_energy Moving target energy 0-100
 * @param static_energy Static target energy 0-100
 * @return Parsed radar reading
 */
RadarReading ld2410_parse_target(
  uint8_t target_state,
  uint16_t moving_distance,
  uint16_t static_distance,
  uint8_t moving_energy,
  uint8_t static_energy
);

#ifndef NATIVE_TEST
#include <HardwareSerial.h>

/** Initialize UART1 for LD2410 radar. */
void ld2410_init(HardwareSerial& serial, int rx_pin, int tx_pin, long baud);

/** Read latest radar data. Non-blocking. */
RadarReading ld2410_read(HardwareSerial& serial);
#endif
