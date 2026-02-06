"""Tests for the State Engine — lift, operator, and engine FSMs."""

from __future__ import annotations

import time

import pytest

from state_engine.lift_state import LiftStateMachine, LiftState
from state_engine.operator_state import OperatorStateMachine, OperatorPresenceState
from state_engine.engine_state import EngineStateMachine, EngineState


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _fused(
    load_tonnes: float = 0.0,
    hook_height: float = 0.0,
    accel_z: float = 0.0,
    wind: float = 20.0,
    uncommanded: bool = False,
) -> dict:
    return {
        "load": {"value_tonnes": load_tonnes, "source": "ocr", "confidence": 0.95},
        "position": {"boom_angle_degrees": 45.0, "boom_distance_m": 15.0, "hook_height_m": hook_height},
        "motion": {"acceleration_vector": [0.0, 0.0, accel_z], "angular_velocity": [0.0, 0.0, 0.0]},
        "environment": {"wind_speed_kmh": wind, "temperature_c": 30.0, "hazard_zone_motion": False},
        "safety_flags": {
            "load_over_limit": False,
            "wind_excessive": False,
            "operator_present": True,
            "operator_drowsy": False,
            "uncommanded_motion": uncommanded,
        },
    }


def _cabin(
    face_detected: bool = True,
    face_confidence: float = 0.95,
    perclos: float = 0.0,
) -> dict:
    return {
        "cabin_camera": {
            "face_detected": face_detected,
            "face_confidence": face_confidence,
            "inference_status": "ready",
        },
        "perclos_score": perclos,
    }


# ---------------------------------------------------------------------------
# Lift State Machine Tests
# ---------------------------------------------------------------------------
class TestLiftStateMachine:
    def test_initial_state_is_idle(self) -> None:
        fsm = LiftStateMachine(crane_id="TEST-001")
        assert fsm.state == LiftState.IDLE

    def test_idle_to_loading_on_load(self) -> None:
        fsm = LiftStateMachine(crane_id="TEST-001")
        update = fsm.update(_fused(load_tonnes=0.5))  # 500 kg > 100 kg
        assert update is not None
        assert update["current_state"] == "loading"
        assert update["previous_state"] == "idle"
        assert fsm.state == LiftState.LOADING

    def test_loading_to_idle_on_no_load(self) -> None:
        fsm = LiftStateMachine(crane_id="TEST-001")
        fsm.update(_fused(load_tonnes=0.5))
        assert fsm.state == LiftState.LOADING

        update = fsm.update(_fused(load_tonnes=0.05))  # 50 kg < 100 kg
        assert update is not None
        assert update["current_state"] == "idle"
        assert fsm.state == LiftState.IDLE

    def test_loading_to_hoisting_on_upward_motion(self) -> None:
        fsm = LiftStateMachine(crane_id="TEST-001")
        fsm.update(_fused(load_tonnes=1.0))
        assert fsm.state == LiftState.LOADING

        # Simulate time passing (>3s load duration)
        fsm._load_detected_at = time.time() - 5.0

        update = fsm.update(_fused(load_tonnes=1.0, accel_z=0.5))  # Upward motion
        assert update is not None
        assert update["current_state"] == "hoisting"

    def test_hoisting_to_lowering_on_downward_motion(self) -> None:
        fsm = LiftStateMachine(crane_id="TEST-001")
        fsm.state = LiftState.HOISTING
        fsm._hoist_start_height = 5.0

        update = fsm.update(_fused(load_tonnes=1.0, accel_z=-0.5, hook_height=10.0))
        assert update is not None
        assert update["current_state"] == "lowering"

    def test_lowering_to_unloading_on_load_release(self) -> None:
        fsm = LiftStateMachine(crane_id="TEST-001")
        fsm.state = LiftState.LOWERING

        update = fsm.update(_fused(load_tonnes=0.05))
        assert update is not None
        assert update["current_state"] == "unloading"

    def test_fault_on_uncommanded_motion(self) -> None:
        fsm = LiftStateMachine(crane_id="TEST-001")
        fsm.state = LiftState.HOISTING

        update = fsm.update(_fused(load_tonnes=1.0, accel_z=6.0, uncommanded=True))
        assert update is not None
        assert update["current_state"] == "fault"

    def test_fault_recovery(self) -> None:
        fsm = LiftStateMachine(crane_id="TEST-001")
        fsm.state = LiftState.FAULT

        update = fsm.update(_fused(load_tonnes=0.0, uncommanded=False))
        assert update is not None
        assert update["current_state"] == "idle"

    def test_load_lost_during_hoist_is_fault(self) -> None:
        fsm = LiftStateMachine(crane_id="TEST-001")
        fsm.state = LiftState.HOISTING

        update = fsm.update(_fused(load_tonnes=0.05))  # Load drops during hoist
        assert update is not None
        assert update["current_state"] == "fault"
        assert "load_lost" in update["transition_reason"]

    def test_no_update_when_state_unchanged(self) -> None:
        fsm = LiftStateMachine(crane_id="TEST-001")
        update = fsm.update(_fused(load_tonnes=0.0))  # Still idle
        assert update is None


# ---------------------------------------------------------------------------
# Operator State Machine Tests
# ---------------------------------------------------------------------------
class TestOperatorStateMachine:
    def test_initial_state_is_absent(self) -> None:
        fsm = OperatorStateMachine(crane_id="TEST-001")
        assert fsm.state == OperatorPresenceState.ABSENT

    def test_absent_to_present_on_face(self) -> None:
        fsm = OperatorStateMachine(crane_id="TEST-001")
        update = fsm.update(_cabin(face_detected=True))
        assert update is not None
        assert update["current_state"] == "present"

    def test_present_to_fatigued_on_perclos(self) -> None:
        fsm = OperatorStateMachine(crane_id="TEST-001")
        fsm.state = OperatorPresenceState.PRESENT
        fsm._last_face_seen = time.time()

        update = fsm.update(_cabin(face_detected=True, perclos=0.35))
        assert update is not None
        assert update["current_state"] == "fatigued"

    def test_fatigued_to_alert_on_recovery(self) -> None:
        fsm = OperatorStateMachine(crane_id="TEST-001")
        fsm.state = OperatorPresenceState.FATIGUED
        fsm._last_face_seen = time.time()

        update = fsm.update(_cabin(face_detected=True, perclos=0.1))
        assert update is not None
        assert update["current_state"] == "alert"

    def test_absent_after_timeout(self) -> None:
        fsm = OperatorStateMachine(crane_id="TEST-001")
        fsm.state = OperatorPresenceState.PRESENT
        fsm._last_face_seen = time.time() - 15.0  # 15s > 10s timeout

        update = fsm.update(_cabin(face_detected=False))
        assert update is not None
        assert update["current_state"] == "absent"

    def test_low_confidence_ignored(self) -> None:
        fsm = OperatorStateMachine(crane_id="TEST-001")
        update = fsm.update(_cabin(face_detected=True, face_confidence=0.3))
        assert update is None  # Below 0.6 threshold

    def test_present_to_alert_on_high_alertness(self) -> None:
        fsm = OperatorStateMachine(crane_id="TEST-001")
        fsm.state = OperatorPresenceState.PRESENT
        fsm._last_face_seen = time.time()

        update = fsm.update(_cabin(face_detected=True, face_confidence=0.95, perclos=0.05))
        assert update is not None
        assert update["current_state"] == "alert"


# ---------------------------------------------------------------------------
# Engine State Machine Tests
# ---------------------------------------------------------------------------
class TestEngineStateMachine:
    def test_initial_state_is_off(self) -> None:
        fsm = EngineStateMachine(crane_id="TEST-001")
        assert fsm.state == EngineState.OFF

    def test_off_to_starting_on_vibration(self) -> None:
        fsm = EngineStateMachine(crane_id="TEST-001")
        # Simulate enough vibration to exceed RPM_OFF_THRESHOLD (50)
        # vibration * 100 + angular * 50 needs to exceed 50 after EMA
        fused = _fused()
        fused["motion"]["acceleration_vector"] = [1.0, 1.0, 10.0]
        fused["motion"]["angular_velocity"] = [0.5, 0.5, 0.5]

        # Multiple updates to accumulate RPM
        for _ in range(10):
            update = fsm.update(fused)
        assert fsm.state in (EngineState.STARTING, EngineState.RUNNING)

    def test_starting_timeout_fault(self) -> None:
        fsm = EngineStateMachine(crane_id="TEST-001")
        fsm.state = EngineState.STARTING
        fsm._starting_at = time.time() - 35.0  # Exceeds 30s timeout
        fsm._rpm_accumulator = 100.0  # Above OFF but below IDLE

        update = fsm.update(_fused())
        assert update is not None
        assert update["current_state"] == "fault"

    def test_overheat_fault(self) -> None:
        fsm = EngineStateMachine(crane_id="TEST-001")
        fsm.state = EngineState.RUNNING

        fused = _fused()
        fused["environment"]["temperature_c"] = 110.0
        update = fsm.update(fused)

        assert update is not None
        assert update["current_state"] == "fault"
        assert "overheat" in update["transition_reason"]

    def test_fault_recovery_on_cooldown(self) -> None:
        fsm = EngineStateMachine(crane_id="TEST-001")
        fsm.state = EngineState.FAULT
        fsm._temperature_c = 110.0
        fsm._rpm_accumulator = 0.0

        fused = _fused()
        fused["environment"]["temperature_c"] = 80.0
        update = fsm.update(fused)

        assert update is not None
        assert update["current_state"] == "off"
        assert "cooldown" in update["transition_reason"]

    def test_running_to_off_on_rpm_drop(self) -> None:
        fsm = EngineStateMachine(crane_id="TEST-001")
        fsm.state = EngineState.RUNNING
        fsm._rpm_accumulator = 800.0

        # Feed zero vibration (no acceleration, no angular velocity)
        fused = _fused()
        fused["motion"]["acceleration_vector"] = [0.0, 0.0, 0.0]
        fused["motion"]["angular_velocity"] = [0.0, 0.0, 0.0]

        # EMA decays: 0.8^n * 800 < 50 needs n > ~14; use 100 to be safe
        for _ in range(100):
            fsm.update(fused)

        assert fsm.state == EngineState.OFF
