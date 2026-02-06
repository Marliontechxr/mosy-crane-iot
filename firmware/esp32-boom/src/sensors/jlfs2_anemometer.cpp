/**
 * jlfs2_anemometer.cpp — JL-FS2 anemometer ADC driver.
 * Blueprint Section 7 — ADC to wind speed conversion.
 */
#include "jlfs2_anemometer.h"
#include "../config.h"

AnemometerReading anemometer_convert(
  uint16_t adc_raw,
  float vref,
  float offset,
  float scale,
  float max_speed
) {
  AnemometerReading reading = {};

  // Convert ADC value to voltage (12-bit ADC: 0-4095)
  reading.raw_voltage = ((float)adc_raw / 4095.0f) * vref;

  // Apply wind speed formula: speed = (voltage - offset) * scale
  float speed = (reading.raw_voltage - offset) * scale;

  // Clamp to valid range
  if (speed < 0.0f) speed = 0.0f;
  if (speed > max_speed) speed = max_speed;

  reading.wind_speed_ms = speed;
  reading.wind_speed_kmh = speed * 3.6f; // m/s to km/h
  reading.valid = true;

  return reading;
}

#ifndef NATIVE_TEST
#include <Arduino.h>

void anemometer_init(int pin) {
  analogReadResolution(12);
  pinMode(pin, INPUT);
}

AnemometerReading anemometer_read(int pin) {
  uint16_t raw = analogRead(pin);
  return anemometer_convert(raw, ANEMOMETER_VREF, ANEMOMETER_OFFSET,
                             ANEMOMETER_SCALE, WIND_SPEED_MAX);
}
#endif
