"""Tests for the Fusion Engine — sensor data fusion and cross-validation."""

from __future__ import annotations

import time

import pytest

from fusion_service.fusion_engine import (
    FusionEngine,
    DataPriority,
    LOAD_DELTA_TONNES,
    WIND_CRITICAL_KMH,
)


# ---------------------------------------------------------------------------
# Fixtures / Helpers
# ---------------------------------------------------------------------------
def _boom_payload(
    lidar_mm: float = 15000.0,
    accel_z: float = 9.81,
    pitch: float = 45.0,
    motion_detected: bool = False,
) -> dict:
    return {
        "timestamp": time.time(),
        "crane_id": "POC-001",
        "sequence": 1,
        "lidar": {"distance_mm": lidar_mm, "signal_strength": 90.0, "status": "good"},
        "imu": {
            "accel_x": 0.0, "accel_y": 0.0, "accel_z": accel_z,
            "gyro_x": 0.0, "gyro_y": 0.0, "gyro_z": 0.0,
            "mag_x": 0.0, "mag_y": 0.0, "mag_z": 0.0,
            "euler_roll": 0.0, "euler_pitch": pitch, "euler_yaw": 0.0,
            "temperature": 35.0,
        },
        "radar": {
            "motion_detected": motion_detected,
            "distance_m": 5.0,
            "target_count": 0,
            "presence_status": "none",
        },
    }


def _cabin_payload(
    wind_speed: float = 20.0,
    face_detected: bool = True,
    temp: float = 30.0,
) -> dict:
    return {
        "timestamp": time.time(),
        "crane_id": "POC-001",
        "sequence": 1,
        "anemometer": {
            "wind_speed_kmh": wind_speed,
            "wind_direction_degrees": 180.0,
            "status": "good",
        },
        "cabin_camera": {
            "inference_status": "ready",
            "face_detected": face_detected,
            "face_confidence": 0.95,
            "face_bounding_box": None,
        },
        "environmental": {
            "temperature_c": temp,
            "humidity_percent": 60.0,
            "cabin_door_open": False,
            "seatbelt_fastened": True,
        },
    }


def _ocr_payload(
    load: float = 10.0,
    angle: float = 45.0,
    radius: float = 15.0,
    height: float = 10.6,
    confidence: float = 0.95,
) -> dict:
    return {
        "timestamp": time.time(),
        "crane_id": "POC-001",
        "sequence": 1,
        "readings": {
            "load": {"raw_value": load, "unit": "tonnes", "confidence": confidence, "method": "digital", "roi_used": "load_roi"},
            "boom_angle": {"raw_value": angle, "unit": "degrees", "confidence": confidence, "method": "digital", "roi_used": "angle_roi"},
            "radius": {"raw_value": radius, "unit": "m", "confidence": confidence, "method": "digital", "roi_used": "radius_roi"},
            "height": {"raw_value": height, "unit": "m", "confidence": confidence, "method": "digital", "roi_used": "height_roi"},
        },
        "quality_metrics": {
            "image_brightness": 0.7,
            "contrast": 0.8,
            "blur_score": 0.1,
            "ocr_engine_version": "paddleocr-3.4",
        },
        "calibration_profile_id": "default",
        "processing_time_ms": 45.0,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
class TestFusionEngineInit:
    def test_create_engine(self) -> None:
        engine = FusionEngine(crane_id="TEST-001")
        assert engine.crane_id == "TEST-001"
        assert engine.rated_capacity_tonnes == 25.0

    def test_fuse_returns_none_with_no_data(self) -> None:
        engine = FusionEngine(crane_id="TEST-001")
        assert engine.fuse() is None


class TestFusionP1OCR:
    def test_ocr_only_produces_p1_fused(self) -> None:
        engine = FusionEngine(crane_id="TEST-001")
        engine.update_ocr(_ocr_payload(load=12.5))
        result = engine.fuse()

        assert result is not None
        assert result["crane_id"] == "TEST-001"
        assert result["load"]["value_tonnes"] == 12.5
        assert result["load"]["source"] == "ocr"
        assert result["status"] == "valid"

    def test_ocr_confidence_propagated(self) -> None:
        engine = FusionEngine(crane_id="TEST-001")
        engine.update_ocr(_ocr_payload(load=5.0, confidence=0.88))
        result = engine.fuse()

        assert result is not None
        assert result["load"]["confidence"] == 0.88


class TestFusionP2CrossValidation:
    def test_ocr_plus_boom_produces_p2(self) -> None:
        engine = FusionEngine(crane_id="TEST-001")
        engine.update_ocr(_ocr_payload(load=10.0, radius=15.0))
        # accel_z=11.81 => deviation=2.0 => imu_est=10.0t, matching OCR load
        engine.update_boom(_boom_payload(lidar_mm=15000.0, accel_z=11.81))
        result = engine.fuse()

        assert result is not None
        assert result["status"] == "valid"
        assert result["position"]["source_distance"] == "lidar"
        assert result["position"]["source_angle"] == "ocr"

    def test_radius_discrepancy_detected(self) -> None:
        engine = FusionEngine(crane_id="TEST-001")
        # OCR says 15m radius, lidar says 20m => delta = 5m > 2m threshold
        engine.update_ocr(_ocr_payload(radius=15.0))
        engine.update_boom(_boom_payload(lidar_mm=20000.0))
        result = engine.fuse()

        assert result is not None
        assert result["status"] == "degraded"
        assert "radius_delta" in (result["degradation_reason"] or "")


class TestFusionP3Fallback:
    def test_boom_only_produces_fallback(self) -> None:
        engine = FusionEngine(crane_id="TEST-001")
        engine.update_boom(_boom_payload(accel_z=10.5))  # Deviation from 9.81
        result = engine.fuse()

        assert result is not None
        assert result["status"] == "degraded"
        assert result["degradation_reason"] == "ocr_unavailable"
        assert result["load"]["source"] == "imu_estimate"

    def test_imu_angle_fallback(self) -> None:
        engine = FusionEngine(crane_id="TEST-001")
        engine.update_boom(_boom_payload(pitch=30.0))
        result = engine.fuse()

        assert result is not None
        assert result["position"]["source_angle"] == "imu"
        assert result["position"]["boom_angle_degrees"] == 30.0


class TestFusionSafetyFlags:
    def test_load_over_limit(self) -> None:
        engine = FusionEngine(crane_id="TEST-001", rated_capacity_tonnes=20.0)
        engine.update_ocr(_ocr_payload(load=19.0))  # 19/20 = 95% > 90%
        result = engine.fuse()

        assert result is not None
        assert result["safety_flags"]["load_over_limit"] is True

    def test_wind_excessive(self) -> None:
        engine = FusionEngine(crane_id="TEST-001")
        engine.update_cabin(_cabin_payload(wind_speed=80.0))
        engine.update_ocr(_ocr_payload())  # Need some data to fuse
        result = engine.fuse()

        assert result is not None
        assert result["safety_flags"]["wind_excessive"] is True

    def test_operator_detected(self) -> None:
        engine = FusionEngine(crane_id="TEST-001")
        engine.update_cabin(_cabin_payload(face_detected=True))
        engine.update_ocr(_ocr_payload())
        result = engine.fuse()

        assert result is not None
        assert result["safety_flags"]["operator_present"] is True

    def test_operator_absent(self) -> None:
        engine = FusionEngine(crane_id="TEST-001")
        engine.update_cabin(_cabin_payload(face_detected=False))
        engine.update_ocr(_ocr_payload())
        result = engine.fuse()

        assert result is not None
        assert result["safety_flags"]["operator_present"] is False

    def test_uncommanded_motion(self) -> None:
        engine = FusionEngine(crane_id="TEST-001")
        # High acceleration deviation
        engine.update_boom(_boom_payload(accel_z=13.0))  # 13 - 9.81 = 3.19 > 2.0
        engine.update_ocr(_ocr_payload())
        result = engine.fuse()

        assert result is not None
        assert result["safety_flags"]["uncommanded_motion"] is True


class TestFusionEnvironment:
    def test_environment_from_cabin(self) -> None:
        engine = FusionEngine(crane_id="TEST-001")
        engine.update_cabin(_cabin_payload(wind_speed=35.5, temp=28.3))
        engine.update_ocr(_ocr_payload())
        result = engine.fuse()

        assert result is not None
        assert result["environment"]["wind_speed_kmh"] == 35.5
        assert result["environment"]["temperature_c"] == 28.3

    def test_hazard_zone_from_radar(self) -> None:
        engine = FusionEngine(crane_id="TEST-001")
        engine.update_boom(_boom_payload(motion_detected=True))
        engine.update_ocr(_ocr_payload())
        result = engine.fuse()

        assert result is not None
        assert result["environment"]["hazard_zone_motion"] is True


class TestFusionSequence:
    def test_sequence_increments(self) -> None:
        engine = FusionEngine(crane_id="TEST-001")
        engine.update_ocr(_ocr_payload())

        r1 = engine.fuse()
        r2 = engine.fuse()
        r3 = engine.fuse()

        assert r1 is not None and r2 is not None and r3 is not None
        assert r1["sequence"] == 1
        assert r2["sequence"] == 2
        assert r3["sequence"] == 3
