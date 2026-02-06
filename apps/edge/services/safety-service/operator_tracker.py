"""MOSY Edge — Operator fatigue detection pipeline orchestrator.

Pipeline: Frame → Face Mesh → EAR/MAR → PERCLOS → Output.
Publishes CabinCameraInference to mosy/{crane_id}/vision/cabin.
"""

from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass
from typing import Dict, Optional

import numpy as np

from shared.logger import setup_logging
from safety_service.face_detector import detect_face, FaceLandmarks
from safety_service.ear_calculator import calculate as calc_ear, EarResult
from safety_service.perclos_tracker import PerclosTracker, PerclosResult

log = setup_logging("operator_tracker")

# Face confidence threshold — ignore low-confidence detections
FACE_CONFIDENCE_MIN = 0.6
# Consecutive closed frames to trigger immediate drowsy alert
CONSECUTIVE_CLOSED_ALERT = 15


@dataclass
class OperatorState:
    """Combined operator fatigue analysis output."""
    face_detected: bool
    face_confidence: float
    ear: Optional[EarResult]
    perclos: Optional[PerclosResult]
    drowsy_alert: bool
    timestamp: float
    inference_id: str
    processing_time_ms: float


class OperatorTracker:
    """Orchestrates face detection → EAR → PERCLOS pipeline."""

    def __init__(self, crane_id: str) -> None:
        self.crane_id = crane_id
        self._perclos = PerclosTracker()
        self._last_face_time: float = 0.0
        self._no_face_count: int = 0
        log.info("operator_tracker_initialized", crane_id=crane_id)

    def process_frame(self, frame_rgb: np.ndarray) -> OperatorState:
        """Process a single RGB frame through the fatigue detection pipeline.

        Args:
            frame_rgb: NumPy array (H, W, 3), dtype uint8, RGB order.

        Returns:
            OperatorState with face detection, EAR, PERCLOS, and drowsy alert.
        """
        start = time.monotonic()
        now = time.time()
        inference_id = uuid.uuid4().hex[:16]

        # Step 1: Face detection
        face = detect_face(frame_rgb)

        if face is None or face.face_confidence < FACE_CONFIDENCE_MIN:
            self._no_face_count += 1
            elapsed_ms = (time.monotonic() - start) * 1000

            if self._no_face_count % 30 == 1:
                log.debug("no_face_detected", consecutive=self._no_face_count)

            return OperatorState(
                face_detected=False,
                face_confidence=face.face_confidence if face else 0.0,
                ear=None,
                perclos=None,
                drowsy_alert=False,
                timestamp=now,
                inference_id=inference_id,
                processing_time_ms=round(elapsed_ms, 2),
            )

        self._no_face_count = 0
        self._last_face_time = now

        # Step 2: EAR / MAR calculation
        ear = calc_ear(face.landmarks)

        # Step 3: PERCLOS update
        perclos = self._perclos.update(
            eyes_closed=ear.eyes_closed,
            yawning=ear.yawning,
            timestamp=now,
        )

        # Step 4: Drowsy alert logic
        drowsy_alert = (
            perclos.fatigue_state in ("drowsy", "fatigued")
            or perclos.consecutive_closed >= CONSECUTIVE_CLOSED_ALERT
            or ear.yawning
        )

        elapsed_ms = (time.monotonic() - start) * 1000

        log.debug(
            "operator_frame_processed",
            ear=round(ear.avg_ear, 3),
            perclos=perclos.perclos_score,
            fatigue=perclos.fatigue_state,
            drowsy_alert=drowsy_alert,
            time_ms=round(elapsed_ms, 1),
        )

        return OperatorState(
            face_detected=True,
            face_confidence=face.face_confidence,
            ear=ear,
            perclos=perclos,
            drowsy_alert=drowsy_alert,
            timestamp=now,
            inference_id=inference_id,
            processing_time_ms=round(elapsed_ms, 2),
        )

    def to_mqtt_payload(self, state: OperatorState) -> Dict:
        """Convert OperatorState to MQTT CabinCameraInference payload.

        Matches mqtt_types.CabinCameraInference schema.
        """
        gaze_direction = "forward" if state.face_detected else "unknown"

        operator_state = {
            "present": state.face_detected,
            "face_detected": state.face_detected,
            "face_confidence": state.face_confidence,
            "gaze_direction": gaze_direction,
            "mouth_open": state.ear.yawning if state.ear else None,
            "mouth_confidence": state.face_confidence if state.ear else None,
        }

        distractions = []
        if state.ear and state.ear.yawning:
            distractions.append("yawning")
        if state.perclos and state.perclos.fatigue_state == "fatigued":
            distractions.append("fatigue")

        environmental = {
            "cabin_cluttered": False,
            "distractions": distractions,
        }

        # Build caption
        if not state.face_detected:
            caption = "No operator face detected in cabin camera."
        elif state.perclos and state.perclos.fatigue_state == "fatigued":
            caption = f"Operator fatigued — PERCLOS {state.perclos.perclos_score:.1%}, immediate attention required."
        elif state.perclos and state.perclos.fatigue_state == "drowsy":
            caption = f"Operator drowsy — PERCLOS {state.perclos.perclos_score:.1%}, monitoring closely."
        elif state.ear and state.ear.yawning:
            caption = "Operator yawning detected."
        else:
            caption = "Operator present and alert."

        return {
            "timestamp": state.timestamp,
            "crane_id": self.crane_id,
            "inference_id": state.inference_id,
            "model_name": "mediapipe-facemesh-v2",
            "operator_state": operator_state,
            "environmental": environmental,
            "caption": caption,
            "processing_time_ms": state.processing_time_ms,
            "perclos_score": state.perclos.perclos_score if state.perclos else 0.0,
        }

    def reset(self) -> None:
        """Reset PERCLOS tracking."""
        self._perclos.reset()
        self._no_face_count = 0
