"""
Vibration detector — SW-420 digital sensor for engine running state.
Blueprint Section 8 — GPIO digital read with debounce.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class VibrationReading:
    """Vibration sensor state."""
    motion_detected: bool   # True if vibration detected (engine running)
    event_count: int        # Total vibration events since init
    last_event_time: float  # Timestamp of last vibration event (epoch)
    valid: bool = True


def detect_vibration_state(
    event_count: int,
    last_event_time: float,
    current_time: float,
    idle_threshold_s: float = 5.0,
) -> bool:
    """
    Determine if engine is running based on vibration events.

    Engine is considered running if at least one vibration event
    occurred within the idle_threshold window.

    Args:
        event_count: Total vibration events since init.
        last_event_time: Epoch time of most recent vibration.
        current_time: Current epoch time.
        idle_threshold_s: Seconds of inactivity before engine is 'off'.

    Returns:
        True if engine is running (vibration within threshold).
    """
    if event_count == 0:
        return False
    return (current_time - last_event_time) < idle_threshold_s


class VibrationDetector:
    """SW-420 vibration sensor GPIO reader."""

    def __init__(self, gpio_pin: int = 17, debounce_ms: int = 20) -> None:
        self._pin = gpio_pin
        self._debounce_ms = debounce_ms
        self._event_count = 0
        self._last_event_time = 0.0
        self._initialized = False
        self._gpio: Optional[object] = None

    def init(self) -> bool:
        """Initialize GPIO for vibration sensor. Returns True on success."""
        try:
            import RPi.GPIO as GPIO  # type: ignore
            self._gpio = GPIO

            GPIO.setmode(GPIO.BCM)
            GPIO.setup(self._pin, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)

            # Falling edge interrupt with debounce
            GPIO.add_event_detect(
                self._pin,
                GPIO.FALLING,
                callback=self._on_vibration,
                bouncetime=self._debounce_ms,
            )

            self._initialized = True
            logger.info("Vibration sensor initialized on GPIO%d", self._pin)
            return True

        except Exception as e:
            logger.error("Vibration sensor init failed: %s", e)
            return False

    def _on_vibration(self, channel: int) -> None:
        """GPIO interrupt callback for vibration events."""
        self._event_count += 1
        self._last_event_time = time.time()

    def read(self) -> VibrationReading:
        """Read current vibration state."""
        if not self._initialized:
            return VibrationReading(False, 0, 0.0, valid=False)

        running = detect_vibration_state(
            self._event_count,
            self._last_event_time,
            time.time(),
        )

        return VibrationReading(
            motion_detected=running,
            event_count=self._event_count,
            last_event_time=self._last_event_time,
        )

    def cleanup(self) -> None:
        """Release GPIO resources."""
        if self._gpio is not None:
            try:
                self._gpio.remove_event_detect(self._pin)
                self._gpio.cleanup(self._pin)
            except Exception:
                pass
