/**
 * jlfs2_anemometer.h — JL-FS2 anemometer ADC driver.
 * Blueprint Section 7 — ADC read, voltage to m/s conversion.
 * Formula: wind_speed = (voltage - 0.054) * 6.59
 */
#pragma once

#include <cstdint>

/** Anemometer reading. */
struct AnemometerReading {
  float wind_speed_ms;   // Wind speed in m/s
  float wind_speed_kmh;  // Wind speed in km/h
  float raw_voltage;     // Raw ADC voltage for diagnostics
  bool valid;
};

/**
 * Convert raw ADC value (12-bit, 0-4095) to wind speed.
 *
 * @param adc_raw Raw ADC value (0-4095)
 * @param vref Reference voltage (typically 5.0V or 3.3V)
 * @param offset Voltage offset (0.054V for JL-FS2)
 * @param scale Scale factor (6.59 m/s per V for JL-FS2)
 * @param max_speed Maximum valid wind speed in m/s
 * @return Wind speed reading
 */
AnemometerReading anemometer_convert(
  uint16_t adc_raw,
  float vref,
  float offset,
  float scale,
  float max_speed
);

#ifndef NATIVE_TEST
/** Initialize ADC for anemometer. */
void anemometer_init(int pin);

/** Read current wind speed. */
AnemometerReading anemometer_read(int pin);
#endif
