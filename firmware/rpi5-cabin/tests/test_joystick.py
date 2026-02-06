"""
Tests for joystick pressure / HX711 ADC conversion.
"""
import pytest
from sensors.joystick_pressure import convert_raw_to_kg, is_joystick_active


class TestConvertRawToKg:
    """Test HX711 ADC value to kg conversion."""

    def test_zero_raw(self):
        assert convert_raw_to_kg(0, 430.0, 0.0) == 0.0

    def test_standard_conversion(self):
        # 430 units = 1 kg
        result = convert_raw_to_kg(430, 430.0, 0.0)
        assert abs(result - 1.0) < 0.01

    def test_with_tare(self):
        # 860 raw / 430 factor = 2.0 - tare 0.5 = 1.5 kg
        result = convert_raw_to_kg(860, 430.0, 0.5)
        assert abs(result - 1.5) < 0.01

    def test_clamp_negative(self):
        # Raw value lower than tare → should clamp to 0
        result = convert_raw_to_kg(100, 430.0, 1.0)
        assert result == 0.0

    def test_zero_calibration_factor(self):
        result = convert_raw_to_kg(1000, 0.0, 0.0)
        assert result == 0.0

    def test_large_weight(self):
        # 4300 raw / 430 = 10 kg
        result = convert_raw_to_kg(4300, 430.0, 0.0)
        assert abs(result - 10.0) < 0.01


class TestIsJoystickActive:
    """Test joystick activity detection."""

    def test_no_weight_inactive(self):
        assert is_joystick_active(0.0) is False

    def test_light_touch_inactive(self):
        assert is_joystick_active(0.3) is False

    def test_at_threshold_active(self):
        assert is_joystick_active(0.5) is True

    def test_above_threshold_active(self):
        assert is_joystick_active(2.0) is True

    def test_custom_threshold(self):
        assert is_joystick_active(0.8, threshold_kg=1.0) is False
        assert is_joystick_active(1.0, threshold_kg=1.0) is True
