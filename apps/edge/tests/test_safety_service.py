"""Tests for the Safety Service — EAR, MAR, PERCLOS, and OperatorTracker."""

from __future__ import annotations

import time
from unittest.mock import patch, MagicMock

import numpy as np
import pytest

from safety_service.ear_calculator import (
    compute_ear,
    compute_mar,
    calculate,
    LEFT_EYE,
    RIGHT_EYE,
    EAR_THRESHOLD,
    MAR_THRESHOLD,
)
from safety_service.perclos_tracker import (
    PerclosTracker,
    PERCLOS_AWAKE,
    PERCLOS_DROWSY,
)


# ---------------------------------------------------------------------------
# Helpers — synthetic landmarks
# ---------------------------------------------------------------------------
def _make_landmarks(
    left_ear_value: float = 0.3,
    right_ear_value: float = 0.3,
    mar_value: float = 0.2,
) -> np.ndarray:
    """Create synthetic 468-point landmarks with controllable EAR/MAR.

    EAR = (v1 + v2) / (2 * h)
    We set h=1.0 and v1=v2=left_ear_value to get EAR = left_ear_value.
    """
    landmarks = np.zeros((468, 3), dtype=np.float64)

    # Left eye: indices [33, 160, 158, 133, 153, 144] = [p1, p2, p3, p4, p5, p6]
    # p1 and p4 define horizontal (set distance = 1.0)
    landmarks[33] = [0.0, 0.5, 0.0]   # p1 left corner
    landmarks[133] = [1.0, 0.5, 0.0]  # p4 right corner
    # v1 = |p2-p6|, v2 = |p3-p5|, h = |p1-p4| = 1.0
    # EAR = (v1 + v2) / (2*h)
    # For target EAR: v1 = v2 = target_ear (since 2*target/(2*1) = target)
    # Each pair spans ±half_v around center, so distance = 2*half_v = target
    half_v = left_ear_value / 2.0
    landmarks[160] = [0.3, 0.5 + half_v, 0.0]  # p2 upper
    landmarks[144] = [0.3, 0.5 - half_v, 0.0]  # p6 lower
    landmarks[158] = [0.7, 0.5 + half_v, 0.0]  # p3 upper
    landmarks[153] = [0.7, 0.5 - half_v, 0.0]  # p5 lower

    # Right eye: indices [362, 385, 387, 263, 373, 380] = [p1, p2, p3, p4, p5, p6]
    landmarks[362] = [2.0, 0.5, 0.0]
    landmarks[263] = [3.0, 0.5, 0.0]
    half_v_r = right_ear_value / 2.0
    landmarks[385] = [2.3, 0.5 + half_v_r, 0.0]
    landmarks[380] = [2.3, 0.5 - half_v_r, 0.0]
    landmarks[387] = [2.7, 0.5 + half_v_r, 0.0]
    landmarks[373] = [2.7, 0.5 - half_v_r, 0.0]

    # Mouth: upper=13, lower=14, left=78, right=308
    # MAR = vertical / horizontal
    # Set horizontal = 1.0, vertical = mar_value
    landmarks[78] = [0.5, 1.5, 0.0]    # mouth left
    landmarks[308] = [1.5, 1.5, 0.0]   # mouth right (h=1.0)
    half_m = mar_value / 2.0
    landmarks[13] = [1.0, 1.5 - half_m, 0.0]   # upper lip
    landmarks[14] = [1.0, 1.5 + half_m, 0.0]   # lower lip

    return landmarks


# ---------------------------------------------------------------------------
# EAR Calculator Tests
# ---------------------------------------------------------------------------
class TestEarCalculator:
    def test_compute_ear_open_eyes(self) -> None:
        landmarks = _make_landmarks(left_ear_value=0.3)
        ear = compute_ear(landmarks, LEFT_EYE)
        assert abs(ear - 0.3) < 0.01

    def test_compute_ear_closed_eyes(self) -> None:
        landmarks = _make_landmarks(left_ear_value=0.1)
        ear = compute_ear(landmarks, LEFT_EYE)
        assert abs(ear - 0.1) < 0.01
        assert ear < EAR_THRESHOLD

    def test_compute_ear_zero_horizontal(self) -> None:
        landmarks = np.zeros((468, 3), dtype=np.float64)
        # p1 and p4 at same position → h=0
        ear = compute_ear(landmarks, LEFT_EYE)
        assert ear == 0.0

    def test_compute_mar_closed_mouth(self) -> None:
        landmarks = _make_landmarks(mar_value=0.2)
        mar = compute_mar(landmarks)
        assert abs(mar - 0.2) < 0.01
        assert mar < MAR_THRESHOLD

    def test_compute_mar_yawning(self) -> None:
        landmarks = _make_landmarks(mar_value=0.9)
        mar = compute_mar(landmarks)
        assert abs(mar - 0.9) < 0.01
        assert mar > MAR_THRESHOLD

    def test_calculate_open_eyes_closed_mouth(self) -> None:
        landmarks = _make_landmarks(left_ear_value=0.3, right_ear_value=0.3, mar_value=0.2)
        result = calculate(landmarks)
        assert not result.eyes_closed
        assert not result.yawning
        assert abs(result.avg_ear - 0.3) < 0.01

    def test_calculate_closed_eyes(self) -> None:
        landmarks = _make_landmarks(left_ear_value=0.1, right_ear_value=0.1, mar_value=0.2)
        result = calculate(landmarks)
        assert result.eyes_closed
        assert result.avg_ear < EAR_THRESHOLD

    def test_calculate_yawning(self) -> None:
        landmarks = _make_landmarks(left_ear_value=0.3, right_ear_value=0.3, mar_value=0.9)
        result = calculate(landmarks)
        assert result.yawning
        assert not result.eyes_closed


# ---------------------------------------------------------------------------
# PERCLOS Tracker Tests
# ---------------------------------------------------------------------------
class TestPerclosTracker:
    def test_empty_tracker_is_awake(self) -> None:
        tracker = PerclosTracker()
        result = tracker.update(eyes_closed=False, yawning=False, timestamp=100.0)
        assert result.fatigue_state == "awake"
        assert result.perclos_score == 0.0

    def test_all_open_is_awake(self) -> None:
        tracker = PerclosTracker(window_s=60.0)
        base_t = 1000.0
        for i in range(60):
            result = tracker.update(eyes_closed=False, yawning=False, timestamp=base_t + i)
        assert result.fatigue_state == "awake"
        assert result.perclos_score < PERCLOS_AWAKE

    def test_all_closed_is_fatigued(self) -> None:
        tracker = PerclosTracker(window_s=60.0)
        base_t = 1000.0
        for i in range(60):
            result = tracker.update(eyes_closed=True, yawning=False, timestamp=base_t + i)
        assert result.fatigue_state == "fatigued"
        assert result.perclos_score >= PERCLOS_DROWSY

    def test_mixed_drowsy(self) -> None:
        tracker = PerclosTracker(window_s=60.0)
        base_t = 1000.0
        # 20% closed → between 15% and 30% → drowsy
        for i in range(100):
            closed = (i % 5 == 0)  # 20% of frames closed
            result = tracker.update(eyes_closed=closed, yawning=False, timestamp=base_t + i * 0.6)
        assert result.fatigue_state == "drowsy"
        assert PERCLOS_AWAKE <= result.perclos_score < PERCLOS_DROWSY

    def test_window_pruning(self) -> None:
        tracker = PerclosTracker(window_s=10.0)
        # Fill with closed eyes
        for i in range(20):
            tracker.update(eyes_closed=True, yawning=False, timestamp=100.0 + i)
        # Then all open for 15 seconds (>10s window)
        for i in range(20):
            result = tracker.update(eyes_closed=False, yawning=False, timestamp=130.0 + i)
        assert result.fatigue_state == "awake"
        assert result.perclos_score == 0.0

    def test_consecutive_closed_tracking(self) -> None:
        tracker = PerclosTracker()
        base_t = 1000.0
        tracker.update(eyes_closed=True, yawning=False, timestamp=base_t)
        tracker.update(eyes_closed=True, yawning=False, timestamp=base_t + 1)
        result = tracker.update(eyes_closed=True, yawning=False, timestamp=base_t + 2)
        assert result.consecutive_closed == 3

    def test_consecutive_resets_on_open(self) -> None:
        tracker = PerclosTracker()
        base_t = 1000.0
        tracker.update(eyes_closed=True, yawning=False, timestamp=base_t)
        tracker.update(eyes_closed=True, yawning=False, timestamp=base_t + 1)
        result = tracker.update(eyes_closed=False, yawning=False, timestamp=base_t + 2)
        assert result.consecutive_closed == 0

    def test_yawn_count(self) -> None:
        tracker = PerclosTracker(window_s=60.0)
        base_t = 1000.0
        for i in range(10):
            yawn = (i % 3 == 0)  # Yawn every 3rd frame
            result = tracker.update(eyes_closed=False, yawning=yawn, timestamp=base_t + i)
        assert result.yawn_count == 4  # frames 0, 3, 6, 9

    def test_reset(self) -> None:
        tracker = PerclosTracker()
        tracker.update(eyes_closed=True, yawning=True, timestamp=1000.0)
        tracker.reset()
        result = tracker.update(eyes_closed=False, yawning=False, timestamp=2000.0)
        assert result.window_samples == 1
        assert result.perclos_score == 0.0


# ---------------------------------------------------------------------------
# Operator Tracker Tests (mocked face detection)
# ---------------------------------------------------------------------------
class TestOperatorTracker:
    @patch("safety_service.operator_tracker.detect_face")
    def test_no_face_returns_absent(self, mock_detect: MagicMock) -> None:
        mock_detect.return_value = None

        from safety_service.operator_tracker import OperatorTracker
        tracker = OperatorTracker(crane_id="TEST-001")

        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        state = tracker.process_frame(frame)

        assert not state.face_detected
        assert state.ear is None
        assert state.perclos is None

    @patch("safety_service.operator_tracker.detect_face")
    def test_face_detected_open_eyes(self, mock_detect: MagicMock) -> None:
        from safety_service.face_detector import FaceLandmarks
        from safety_service.operator_tracker import OperatorTracker

        landmarks = _make_landmarks(left_ear_value=0.3, right_ear_value=0.3, mar_value=0.2)
        mock_detect.return_value = FaceLandmarks(landmarks=landmarks, face_confidence=0.95)

        tracker = OperatorTracker(crane_id="TEST-001")
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        state = tracker.process_frame(frame)

        assert state.face_detected
        assert state.face_confidence == 0.95
        assert state.ear is not None
        assert not state.ear.eyes_closed
        assert state.perclos is not None
        assert state.perclos.fatigue_state == "awake"
        assert not state.drowsy_alert

    @patch("safety_service.operator_tracker.detect_face")
    def test_face_detected_yawning(self, mock_detect: MagicMock) -> None:
        from safety_service.face_detector import FaceLandmarks
        from safety_service.operator_tracker import OperatorTracker

        landmarks = _make_landmarks(left_ear_value=0.3, right_ear_value=0.3, mar_value=0.9)
        mock_detect.return_value = FaceLandmarks(landmarks=landmarks, face_confidence=0.95)

        tracker = OperatorTracker(crane_id="TEST-001")
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        state = tracker.process_frame(frame)

        assert state.face_detected
        assert state.ear is not None
        assert state.ear.yawning
        assert state.drowsy_alert  # Yawning triggers alert

    @patch("safety_service.operator_tracker.detect_face")
    def test_mqtt_payload_format(self, mock_detect: MagicMock) -> None:
        from safety_service.face_detector import FaceLandmarks
        from safety_service.operator_tracker import OperatorTracker

        landmarks = _make_landmarks(left_ear_value=0.3, right_ear_value=0.3, mar_value=0.2)
        mock_detect.return_value = FaceLandmarks(landmarks=landmarks, face_confidence=0.95)

        tracker = OperatorTracker(crane_id="TEST-001")
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        state = tracker.process_frame(frame)
        payload = tracker.to_mqtt_payload(state)

        assert payload["crane_id"] == "TEST-001"
        assert payload["model_name"] == "mediapipe-facemesh-v2"
        assert "operator_state" in payload
        assert "environmental" in payload
        assert "caption" in payload
        assert payload["operator_state"]["present"] is True
        assert payload["operator_state"]["face_detected"] is True

    @patch("safety_service.operator_tracker.detect_face")
    def test_low_confidence_ignored(self, mock_detect: MagicMock) -> None:
        from safety_service.face_detector import FaceLandmarks
        from safety_service.operator_tracker import OperatorTracker

        landmarks = _make_landmarks()
        mock_detect.return_value = FaceLandmarks(landmarks=landmarks, face_confidence=0.3)

        tracker = OperatorTracker(crane_id="TEST-001")
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        state = tracker.process_frame(frame)

        assert not state.face_detected  # Below 0.6 threshold
