"""
Joystick pressure sensor — HX711 ADC for load cell on joystick.
Blueprint Section 8 — detect active operation vs idle.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class JoystickReading:
    """Joystick pressure / load cell reading."""
    weight_kg: float        # Measured weight in kg
    raw_value: int          # Raw HX711 ADC value
    is_active: bool         # True if operator is actively pressing joystick
    valid: bool = True


def convert_raw_to_kg(
    raw_value: int,
    calibration_factor: float,
    tare_weight: float,
) -> float:
    """
    Convert raw HX711 ADC value to kilograms.

    Args:
        raw_value: Raw 24-bit ADC value.
        calibration_factor: Units per kilogram (from calibration).
        tare_weight: Weight offset (zero point).

    Returns:
        Weight in kilograms.
    """
    if calibration_factor == 0:
        return 0.0
    return max(0.0, (raw_value / calibration_factor) - tare_weight)


def is_joystick_active(weight_kg: float, threshold_kg: float = 0.5) -> bool:
    """
    Determine if the operator is actively pressing the joystick.

    Args:
        weight_kg: Current measured weight.
        threshold_kg: Minimum weight to consider active (default 0.5 kg).

    Returns:
        True if weight exceeds the threshold.
    """
    return weight_kg >= threshold_kg


class JoystickPressure:
    """HX711 ADC reader for joystick load cell."""

    def __init__(
        self,
        dout_pin: int = 27,
        sck_pin: int = 22,
        calibration_factor: float = 430.0,
        tare_weight: float = 0.0,
    ) -> None:
        self._dout = dout_pin
        self._sck = sck_pin
        self._cal_factor = calibration_factor
        self._tare = tare_weight
        self._hx: Optional[object] = None
        self._initialized = False

    def init(self) -> bool:
        """Initialize HX711 ADC. Returns True on success."""
        try:
            import RPi.GPIO as GPIO  # type: ignore
            GPIO.setmode(GPIO.BCM)

            # Use adafruit HX711 or manual implementation
            # For POC, we use a simple GPIO-based approach
            from adafruit_hx711.hx711 import HX711  # type: ignore

            self._hx = HX711(self._dout, self._sck)
            self._hx.tare()
            self._initialized = True
            logger.info("HX711 joystick pressure initialized (DOUT=%d, SCK=%d)",
                        self._dout, self._sck)
            return True

        except Exception as e:
            logger.error("HX711 init failed: %s", e)
            return False

    def read(self) -> JoystickReading:
        """Read current joystick pressure."""
        if not self._initialized or self._hx is None:
            return JoystickReading(0.0, 0, False, valid=False)

        try:
            raw = self._hx.read()
            weight = convert_raw_to_kg(raw, self._cal_factor, self._tare)
            active = is_joystick_active(weight)

            return JoystickReading(
                weight_kg=round(weight, 2),
                raw_value=raw,
                is_active=active,
            )

        except Exception as e:
            logger.warning("HX711 read failed: %s", e)
            return JoystickReading(0.0, 0, False, valid=False)

    def tare(self) -> None:
        """Re-tare the load cell (set current weight as zero)."""
        if self._hx is not None:
            self._hx.tare()
            logger.info("HX711 tared")
