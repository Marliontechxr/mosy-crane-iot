"""MOSY Edge — Engine State Machine.

States (from shared-types): off, starting, running, fault
Driven by cabin telemetry (environmental data — temperature, vibration proxy).
Uses dual accumulator pattern for RPM-based state detection.
"""

from __future__ import annotations

import time
from enum import Enum
from typing import Any, Dict, Optional

from shared.logger import setup_logging

log = setup_logging("engine_state")

# Thresholds
RPM_OFF_THRESHOLD = 50.0
RPM_IDLE_THRESHOLD = 400.0
RPM_RUNNING_THRESHOLD = 800.0
TEMP_OVERHEAT_C = 105.0
TEMP_COLD_START_C = 40.0
STARTING_TIMEOUT_S = 30.0
IDLE_TIMEOUT_MINUTES = 30.0


class EngineState(str, Enum):
    OFF = "off"
    STARTING = "starting"
    RUNNING = "running"
    FAULT = "fault"


class EngineStateMachine:
    """FSM tracking engine state via RPM and temperature (dual accumulator)."""

    def __init__(self, crane_id: str) -> None:
        self.crane_id = crane_id
        self.state = EngineState.OFF
        self._rpm: float = 0.0
        self._temperature_c: float = 0.0
        self._starting_at: Optional[float] = None
        self._idle_since: Optional[float] = None
        self._idle_duration_min: float = 0.0
        # Dual accumulator for RPM smoothing
        self._rpm_accumulator: float = 0.0
        self._rpm_count: int = 0

    def update(self, fused: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process fused telemetry for engine state. Returns state update if changed."""
        now = time.time()
        prev = self.state

        # Extract engine-relevant data from fused telemetry
        env = fused.get("environment", {})
        self._temperature_c = env.get("temperature_c", self._temperature_c)

        # RPM proxy: In Phase 3 POC without direct RPM sensor, use vibration magnitude
        # from IMU as a rough proxy. Real RPM comes from RPi5 cabin hub in Phase 7.
        motion = fused.get("motion", {})
        accel = motion.get("acceleration_vector", [0, 0, 0])
        angular = motion.get("angular_velocity", [0, 0, 0])

        # Vibration magnitude as RPM proxy (rough heuristic)
        vibration = sum(a ** 2 for a in accel) ** 0.5
        angular_mag = sum(g ** 2 for g in angular) ** 0.5
        self._rpm = self._estimate_rpm(vibration, angular_mag)

        # Update idle tracking
        if self.state == EngineState.RUNNING and self._rpm < RPM_RUNNING_THRESHOLD:
            if self._idle_since is None:
                self._idle_since = now
            self._idle_duration_min = (now - self._idle_since) / 60.0
        else:
            self._idle_since = None
            self._idle_duration_min = 0.0

        # Fault: overheating
        if self._temperature_c > TEMP_OVERHEAT_C and self.state != EngineState.FAULT:
            self.state = EngineState.FAULT
            return self._make_update(prev, f"overheat temp={self._temperature_c:.1f}C")

        if self.state == EngineState.OFF:
            if self._rpm > RPM_OFF_THRESHOLD:
                self._starting_at = now
                self.state = EngineState.STARTING
                return self._make_update(prev, "ignition_detected")

        elif self.state == EngineState.STARTING:
            if self._rpm >= RPM_IDLE_THRESHOLD:
                self.state = EngineState.RUNNING
                self._starting_at = None
                return self._make_update(prev, "engine_running")
            # Starting timeout
            if self._starting_at and (now - self._starting_at) > STARTING_TIMEOUT_S:
                self.state = EngineState.FAULT
                self._starting_at = None
                return self._make_update(prev, "start_timeout")

        elif self.state == EngineState.RUNNING:
            if self._rpm < RPM_OFF_THRESHOLD:
                self.state = EngineState.OFF
                return self._make_update(prev, "engine_stopped")
            # Extended idle warning (not a state change, but logged)
            if self._idle_duration_min > IDLE_TIMEOUT_MINUTES:
                log.warning(
                    "extended_idle",
                    idle_minutes=round(self._idle_duration_min, 1),
                    rpm=round(self._rpm, 0),
                )

        elif self.state == EngineState.FAULT:
            # Recovery: temperature below threshold and RPM stable
            if self._temperature_c < TEMP_OVERHEAT_C - 10 and self._rpm < RPM_RUNNING_THRESHOLD:
                self.state = EngineState.OFF
                return self._make_update(prev, "fault_cleared_cooldown")

        return None

    def _estimate_rpm(self, vibration: float, angular_mag: float) -> float:
        """Dual accumulator RPM estimation from vibration + angular velocity."""
        # Exponential moving average
        raw_rpm = (vibration * 100) + (angular_mag * 50)
        self._rpm_accumulator = 0.8 * self._rpm_accumulator + 0.2 * raw_rpm
        self._rpm_count += 1
        return self._rpm_accumulator

    def _make_update(self, previous: EngineState, reason: str) -> Dict[str, Any]:
        log.info(
            "engine_state_changed",
            previous=previous.value,
            current=self.state.value,
            reason=reason,
        )
        return {
            "timestamp": time.time(),
            "crane_id": self.crane_id,
            "previous_state": previous.value,
            "current_state": self.state.value,
            "transition_reason": reason,
            "engine_temperature_c": round(self._temperature_c, 1),
            "engine_rpm": round(self._rpm, 0),
            "idle_duration_minutes": round(self._idle_duration_min, 1),
        }
