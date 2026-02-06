"""MOSY Edge — Lift State Machine.

States (from shared-types): idle, loading, hoisting, lowering, unloading, fault
Transitions driven by fused telemetry (load, motion, position).

A REAL_LIFT is detected when:
  - Weight > 100 kg AND Duration > 30s AND Displacement > 2m
"""

from __future__ import annotations

import time
from enum import Enum
from typing import Any, Dict, Optional

from shared.logger import setup_logging

log = setup_logging("lift_state")

# Thresholds
LOAD_THRESHOLD_KG = 100.0
LIFT_DURATION_S = 30.0
DISPLACEMENT_M = 2.0
FAULT_ACCEL_THRESHOLD = 5.0  # m/s² — uncommanded motion above this is fault


class LiftState(str, Enum):
    IDLE = "idle"
    LOADING = "loading"
    HOISTING = "hoisting"
    LOWERING = "lowering"
    UNLOADING = "unloading"
    FAULT = "fault"


class LiftStateMachine:
    """Finite state machine tracking the crane lift cycle."""

    def __init__(self, crane_id: str) -> None:
        self.crane_id = crane_id
        self.state = LiftState.IDLE
        self._load_detected_at: Optional[float] = None
        self._hoist_start_height: Optional[float] = None
        self._lower_start_height: Optional[float] = None
        self._last_load_tonnes = 0.0

    def update(self, fused: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process a fused telemetry message and return a state update if changed."""
        load_tonnes = fused.get("load", {}).get("value_tonnes", 0.0)
        load_kg = load_tonnes * 1000.0
        hook_height = fused.get("position", {}).get("hook_height_m", 0.0)
        safety = fused.get("safety_flags", {})
        uncommanded = safety.get("uncommanded_motion", False)
        now = time.time()

        prev = self.state

        # Check for fault condition first (highest priority)
        if uncommanded and self.state != LiftState.FAULT:
            accel = fused.get("motion", {}).get("acceleration_vector", [0, 0, 0])
            accel_mag = sum(a ** 2 for a in accel) ** 0.5
            if accel_mag > FAULT_ACCEL_THRESHOLD:
                self.state = LiftState.FAULT
                return self._make_update(prev, "uncommanded_motion_detected", load_tonnes)

        if self.state == LiftState.IDLE:
            if load_kg > LOAD_THRESHOLD_KG:
                self._load_detected_at = now
                self.state = LiftState.LOADING
                return self._make_update(prev, "load_detected", load_tonnes)

        elif self.state == LiftState.LOADING:
            if load_kg <= LOAD_THRESHOLD_KG:
                self._load_detected_at = None
                self.state = LiftState.IDLE
                return self._make_update(prev, "load_removed", load_tonnes)

            # Detect hoist start: sustained load and upward motion
            if self._load_detected_at and (now - self._load_detected_at) > 3.0:
                motion = fused.get("motion", {}).get("acceleration_vector", [0, 0, 0])
                if len(motion) >= 3 and motion[2] > 0.3:
                    self._hoist_start_height = hook_height
                    self.state = LiftState.HOISTING
                    return self._make_update(prev, "hoist_initiated", load_tonnes)

        elif self.state == LiftState.HOISTING:
            if load_kg <= LOAD_THRESHOLD_KG:
                self.state = LiftState.FAULT
                return self._make_update(prev, "load_lost_during_hoist", load_tonnes)

            # Check for lowering transition (downward motion)
            motion = fused.get("motion", {}).get("acceleration_vector", [0, 0, 0])
            if len(motion) >= 3 and motion[2] < -0.3:
                displacement = 0.0
                if self._hoist_start_height is not None:
                    displacement = abs(hook_height - self._hoist_start_height)
                self._lower_start_height = hook_height
                self.state = LiftState.LOWERING
                return self._make_update(
                    prev,
                    f"lowering_initiated displacement={displacement:.1f}m",
                    load_tonnes,
                    metadata={"displacement_m": displacement},
                )

        elif self.state == LiftState.LOWERING:
            if load_kg <= LOAD_THRESHOLD_KG:
                self.state = LiftState.UNLOADING
                return self._make_update(prev, "load_released", load_tonnes)

            # Return to hoisting if upward motion resumes
            motion = fused.get("motion", {}).get("acceleration_vector", [0, 0, 0])
            if len(motion) >= 3 and motion[2] > 0.3:
                self.state = LiftState.HOISTING
                return self._make_update(prev, "hoist_resumed", load_tonnes)

        elif self.state == LiftState.UNLOADING:
            if load_kg <= LOAD_THRESHOLD_KG / 2:
                # Validate if this was a REAL_LIFT
                self._validate_real_lift(fused, now)
                self.state = LiftState.IDLE
                return self._make_update(prev, "cycle_complete", load_tonnes)

        elif self.state == LiftState.FAULT:
            # Recovery: no uncommanded motion and load is stable
            if not uncommanded:
                self.state = LiftState.IDLE
                self._load_detected_at = None
                return self._make_update(prev, "fault_cleared", load_tonnes)

        self._last_load_tonnes = load_tonnes
        return None

    def _validate_real_lift(self, fused: Dict[str, Any], now: float) -> None:
        """Log whether the completed cycle was a REAL_LIFT."""
        duration = 0.0
        if self._load_detected_at:
            duration = now - self._load_detected_at

        displacement = 0.0
        if self._hoist_start_height is not None:
            hook_height = fused.get("position", {}).get("hook_height_m", 0.0)
            displacement = abs(hook_height - self._hoist_start_height)

        is_real = (
            self._last_load_tonnes * 1000 > LOAD_THRESHOLD_KG
            and duration > LIFT_DURATION_S
            and displacement > DISPLACEMENT_M
        )

        log.info(
            "lift_cycle_validated",
            is_real_lift=is_real,
            duration_s=round(duration, 1),
            displacement_m=round(displacement, 1),
            peak_load_tonnes=round(self._last_load_tonnes, 2),
        )
        self._load_detected_at = None
        self._hoist_start_height = None

    def _make_update(
        self,
        previous: LiftState,
        reason: str,
        load_tonnes: float,
        metadata: Optional[Dict[str, object]] = None,
    ) -> Dict[str, Any]:
        log.info(
            "lift_state_changed",
            previous=previous.value,
            current=self.state.value,
            reason=reason,
        )
        result: Dict[str, Any] = {
            "timestamp": time.time(),
            "crane_id": self.crane_id,
            "previous_state": previous.value,
            "current_state": self.state.value,
            "transition_reason": reason,
            "load_at_transition": round(load_tonnes, 2),
        }
        if metadata:
            result["metadata"] = metadata
        return result
