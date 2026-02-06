"""MOSY Edge — Operator State Machine.

States (from shared-types): absent, present, fatigued, alert
Driven by cabin telemetry (face detection, PERCLOS from Phase 4).
"""

from __future__ import annotations

import time
from enum import Enum
from typing import Any, Dict, Optional

from shared.logger import setup_logging

log = setup_logging("operator_state")

# Thresholds
FACE_CONFIDENCE_MIN = 0.6
PERCLOS_FATIGUE_THRESHOLD = 0.3  # 30% eye closure = fatigued
ABSENT_TIMEOUT_S = 10.0  # No face detected for 10s = absent


class OperatorPresenceState(str, Enum):
    ABSENT = "absent"
    PRESENT = "present"
    FATIGUED = "fatigued"
    ALERT = "alert"


class OperatorStateMachine:
    """FSM tracking operator presence and alertness."""

    def __init__(self, crane_id: str) -> None:
        self.crane_id = crane_id
        self.state = OperatorPresenceState.ABSENT
        self._last_face_seen: float = 0.0
        self._perclos_score: float = 0.0
        self._confidence: float = 0.0

    def update(self, cabin: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process cabin telemetry and return a state update if changed."""
        now = time.time()
        prev = self.state

        camera = cabin.get("cabin_camera", {})
        face_detected = camera.get("face_detected", False)
        face_confidence = camera.get("face_confidence", 0.0)

        # PERCLOS score comes from vision-service (Phase 4)
        # For Phase 3 POC, we derive a rough estimate from camera data
        perclos = cabin.get("perclos_score", 0.0)
        self._perclos_score = perclos
        self._confidence = face_confidence

        if face_detected and face_confidence >= FACE_CONFIDENCE_MIN:
            self._last_face_seen = now

            if perclos >= PERCLOS_FATIGUE_THRESHOLD:
                if self.state != OperatorPresenceState.FATIGUED:
                    self.state = OperatorPresenceState.FATIGUED
                    return self._make_update(prev, f"perclos={perclos:.2f} exceeds threshold")
            elif self.state == OperatorPresenceState.FATIGUED:
                # Recovery from fatigue
                self.state = OperatorPresenceState.ALERT
                return self._make_update(prev, f"perclos={perclos:.2f} recovered")
            elif self.state == OperatorPresenceState.ABSENT:
                self.state = OperatorPresenceState.PRESENT
                return self._make_update(prev, "face_detected")
            elif self.state == OperatorPresenceState.PRESENT:
                # Already present — check if alert (high confidence, low perclos)
                if face_confidence > 0.9 and perclos < 0.1:
                    self.state = OperatorPresenceState.ALERT
                    return self._make_update(prev, "high_alertness_detected")
        else:
            # No face detected
            if self._last_face_seen > 0 and (now - self._last_face_seen) > ABSENT_TIMEOUT_S:
                if self.state != OperatorPresenceState.ABSENT:
                    self.state = OperatorPresenceState.ABSENT
                    return self._make_update(prev, f"no_face_for_{ABSENT_TIMEOUT_S}s")

        return None

    def _make_update(self, previous: OperatorPresenceState, reason: str) -> Dict[str, Any]:
        log.info(
            "operator_state_changed",
            previous=previous.value,
            current=self.state.value,
            reason=reason,
        )
        return {
            "timestamp": time.time(),
            "crane_id": self.crane_id,
            "previous_state": previous.value,
            "current_state": self.state.value,
            "perclos_score": round(self._perclos_score, 3),
            "confidence": round(self._confidence, 3),
        }
