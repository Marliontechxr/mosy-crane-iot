"""MOSY Edge -- Productivity Scorer.

Calculates per-shift productivity scores using penalty deductions.
Blueprint Section 6.7: BASE_SCORE = 100, penalties deducted per event.

Penalty schedule:
  - fatigue_warning:        -15  (PERCLOS 8-15%)
  - fatigue_critical:       -30  (PERCLOS > 15%)
  - load_exceed:            -25  (load > rated capacity)
  - overspeed:              -10  (wind > 35 km/h)
  - idle_time_extended:      -5  (idle > 5 min)
  - personnel_in_drop_zone: -50  (person detected in load zone)
  - engine_overheat:        -20  (temp > 105 C)
"""
from __future__ import annotations

import time
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


@dataclass
class ProductivityScore:
    """Immutable score result."""

    base_score: int
    penalties: Dict[str, int]
    final_score: int
    timestamp: float = field(default_factory=time.time)


class ProductivityScorer:
    """Calculates per-shift operator productivity scores.

    Thread-safe: no shared mutable state between shifts.
    Each shift begins with start_shift() which resets accumulated penalties.
    """

    BASE_SCORE: int = 100

    PENALTIES: Dict[str, int] = {
        "fatigue_warning": 15,
        "fatigue_critical": 30,
        "load_exceed": 25,
        "overspeed": 10,
        "idle_time_extended": 5,
        "personnel_in_drop_zone": 50,
        "engine_overheat": 20,
    }

    def __init__(self, crane_id: str) -> None:
        """Initialize scorer for a specific crane."""
        self.crane_id = crane_id
        self._accumulated: Dict[str, bool] = {}
        self._shift_active = False

    def start_shift(self) -> None:
        """Begin a new scoring period -- resets all penalties."""
        self._accumulated = {}
        self._shift_active = True
        logger.info("Shift scoring started for crane %s", self.crane_id)

    def end_shift(self) -> None:
        """Mark the shift as ended."""
        self._shift_active = False

    @property
    def is_active(self) -> bool:
        """Whether a shift is currently being scored."""
        return self._shift_active

    def record_penalty(self, penalty_name: str) -> None:
        """Record a penalty event. Each penalty type is applied at most once per shift."""
        if penalty_name not in self.PENALTIES:
            return
        if not self._accumulated.get(penalty_name):
            self._accumulated[penalty_name] = True
            logger.info(
                "Penalty recorded: %s (-%d)",
                penalty_name,
                self.PENALTIES[penalty_name],
            )

    def process_state_update(self, topic: str, payload: Dict[str, Any]) -> None:
        """Process an MQTT state/telemetry message to detect penalty conditions."""
        if not self._shift_active:
            return

        # Operator fatigue
        if "state/operator" in topic:
            state = payload.get("current_state", "")
            perclos = payload.get("perclos_score", 0.0)
            if state == "fatigued" or perclos > 0.15:
                self.record_penalty("fatigue_critical")
            elif perclos > 0.08:
                self.record_penalty("fatigue_warning")

        # Lift issues
        elif "state/lift" in topic:
            reason = str(payload.get("transition_reason", ""))
            if "load_lost" in reason or "uncommanded" in reason:
                self.record_penalty("load_exceed")

        # Engine issues
        elif "state/engine" in topic:
            temp = payload.get("engine_temperature_c", 0.0)
            idle_min = payload.get("idle_duration_minutes", 0.0)
            if temp > 105:
                self.record_penalty("engine_overheat")
            if idle_min > 5.0:
                self.record_penalty("idle_time_extended")

        # Personnel detection from boom camera
        elif "vision/boom" in topic:
            for det in payload.get("detections", []):
                if (
                    det.get("class_label") == "person"
                    and det.get("confidence", 0) > 0.5
                ):
                    self.record_penalty("personnel_in_drop_zone")
                    break

        # Wind overspeed from fused telemetry
        elif "telemetry/fused" in topic:
            env = payload.get("environment", {})
            wind = env.get("wind_speed_kmh", 0)
            if wind > 35:
                self.record_penalty("overspeed")

    def calculate(self) -> ProductivityScore:
        """Calculate the final productivity score."""
        total_deduction = 0
        breakdown: Dict[str, int] = {}
        for name, applied in self._accumulated.items():
            if applied and name in self.PENALTIES:
                deduction = self.PENALTIES[name]
                breakdown[name] = deduction
                total_deduction += deduction
        final = max(0, min(100, self.BASE_SCORE - total_deduction))
        return ProductivityScore(
            base_score=self.BASE_SCORE,
            penalties=breakdown,
            final_score=final,
        )

    def to_mqtt_payload(self) -> Dict[str, Any]:
        """Serialize the current score as an MQTT-publishable dict."""
        result = self.calculate()
        return {
            "timestamp": result.timestamp,
            "crane_id": self.crane_id,
            "base_score": result.base_score,
            "penalties": result.penalties,
            "final_score": result.final_score,
        }
