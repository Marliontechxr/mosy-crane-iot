/**
 * ld2410_radar.cpp — HLK-LD2410 mmWave radar UART driver.
 * Blueprint Section 7 — near-field obstacle detection ≤5m.
 */
#include "ld2410_radar.h"
#include "../config.h"

const char* presence_status_string(PresenceStatus status) {
  switch (status) {
    case PresenceStatus::MOVING:     return "moving";
    case PresenceStatus::STATIONARY: return "stationary";
    default:                         return "none";
  }
}

RadarReading ld2410_parse_target(
  uint8_t target_state,
  uint16_t moving_distance,
  uint16_t static_distance,
  uint8_t moving_energy,
  uint8_t static_energy
) {
  RadarReading reading = {};
  reading.valid = true;

  // Target state: 0=none, 1=moving, 2=stationary, 3=both
  if (target_state == 0) {
    reading.motion_detected = false;
    reading.distance_m = 0.0f;
    reading.target_count = 0;
    reading.presence = PresenceStatus::NONE;
    return reading;
  }

  reading.target_count = 0;
  float closest_distance = 999.0f;

  if (target_state & 0x01) {
    // Moving target
    reading.motion_detected = true;
    float dist = (float)moving_distance / 100.0f; // cm → m
    if (dist < closest_distance) closest_distance = dist;
    reading.target_count++;
    reading.presence = PresenceStatus::MOVING;
  }

  if (target_state & 0x02) {
    // Stationary target
    float dist = (float)static_distance / 100.0f;
    if (dist < closest_distance) closest_distance = dist;
    reading.target_count++;
    if (!reading.motion_detected) {
      reading.presence = PresenceStatus::STATIONARY;
    }
  }

  reading.distance_m = closest_distance;
  if (closest_distance >= 999.0f) {
    reading.distance_m = 0.0f;
    reading.valid = false;
  }

  return reading;
}

#ifndef NATIVE_TEST

// LD2410 frame markers
static const uint8_t FRAME_HEADER[] = {0xF4, 0xF3, 0xF2, 0xF1};
static const uint8_t FRAME_FOOTER[] = {0xF8, 0xF7, 0xF6, 0xF5};

void ld2410_init(HardwareSerial& serial, int rx_pin, int tx_pin, long baud) {
  serial.begin(baud, SERIAL_8N1, rx_pin, tx_pin);
}

RadarReading ld2410_read(HardwareSerial& serial) {
  RadarReading reading = {};
  reading.valid = false;

  // LD2410 sends periodic data frames
  // Frame: [F4 F3 F2 F1] [len_lo len_hi] [type] [head] [data...] [F8 F7 F6 F5]
  // Target data report type = 0x02, head = 0xAA

  while (serial.available() >= 23) { // Minimum frame size
    // Scan for header
    uint8_t b = serial.read();
    if (b != FRAME_HEADER[0]) continue;

    bool header_match = true;
    for (int i = 1; i < 4; i++) {
      if (serial.available() == 0 || serial.read() != FRAME_HEADER[i]) {
        header_match = false;
        break;
      }
    }
    if (!header_match) continue;

    // Read data length (2 bytes, little-endian)
    if (serial.available() < 2) break;
    uint16_t data_len = serial.read() | ((uint16_t)serial.read() << 8);
    if (data_len > 64 || data_len < 7) continue; // Sanity check

    // Read data type and head
    if (serial.available() < (int)data_len + 4) break; // +4 for footer
    uint8_t data_type = serial.read();
    uint8_t head = serial.read();

    if (data_type != 0x02 || head != 0xAA) {
      // Skip non-target data frames
      for (uint16_t i = 2; i < data_len + 4; i++) serial.read();
      continue;
    }

    // Parse target data: [target_state] [moving_dist_lo] [moving_dist_hi] [moving_energy]
    //                     [static_dist_lo] [static_dist_hi] [static_energy]
    uint8_t target_state = serial.read();
    uint16_t moving_dist = serial.read() | ((uint16_t)serial.read() << 8);
    uint8_t moving_energy = serial.read();
    uint16_t static_dist = serial.read() | ((uint16_t)serial.read() << 8);
    uint8_t static_energy = serial.read();

    // Consume remaining bytes + footer
    for (uint16_t i = 9; i < data_len + 4; i++) serial.read();

    reading = ld2410_parse_target(target_state, moving_dist, static_dist,
                                   moving_energy, static_energy);
    break;
  }

  return reading;
}
#endif
