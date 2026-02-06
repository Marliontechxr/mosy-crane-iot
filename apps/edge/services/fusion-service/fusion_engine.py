"""MOSY Edge — Sensor Fusion Engine.

Implements the data source hierarchy from Blueprint Section 6.3:
  P1: Dashboard OCR (primary truth source)
  P2: Cross-validation (OCR + sensor agreement)
  P3: Fallback (sensor-only when OCR unavailable)

Publishes fused telemetry at 1 Hz to mosy/{crane_id}/telemetry/fused.
"""

from __future__ import annotations

import math
import time
import uuid
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, Optional

from shared.logger import setup_logging

log = setup_logging("fusion_engine")

# ---------------------------------------------------------------------------
# Discrepancy thresholds (Blueprint Section 6.3)
# ---------------------------------------------------------------------------
LOAD_DELTA_TONNES = 5.0
RADIUS_DELTA_M = 2.0
HEIGHT_DELTA_M = 2.0
MAX_OCR_AGE_S = 3.0
MAX_BOOM_AGE_S = 2.0
MAX_CABIN_AGE_S = 2.0
WIND_CRITICAL_KMH = 72.0
LOAD_OVER_LIMIT_PCT = 0.9  # 90% of rated capacity triggers warning


class DataPriority(str, Enum):
    """Fusion data source priority levels."""
    P1_OCR = "P1_OCR"
    P2_CROSS_VALIDATED = "P2_CROSS_VALIDATED"
    P3_FALLBACK = "P3_FALLBACK"


@dataclass
class SourceSnapshot:
    """Latest payload from a specific source, timestamped."""
    data: Dict[str, Any]
    received_at: float


class FusionEngine:
    """Fuses boom, cabin, and OCR telemetry into a single authoritative stream."""

    def __init__(self, crane_id: str, rated_capacity_tonnes: float = 25.0) -> None:
        self.crane_id = crane_id
        self.rated_capacity_tonnes = rated_capacity_tonnes
        self._sequence = 0

        # Latest snapshots
        self._boom: Optional[SourceSnapshot] = None
        self._cabin: Optional[SourceSnapshot] = None
        self._ocr: Optional[SourceSnapshot] = None

        self._discrepancies: list[str] = []

    # ------------------------------------------------------------------
    # Ingestion
    # ------------------------------------------------------------------
    def update_boom(self, payload: Dict[str, Any]) -> None:
        """Ingest boom telemetry (lidar, IMU, radar)."""
        self._boom = SourceSnapshot(data=payload, received_at=time.time())

    def update_cabin(self, payload: Dict[str, Any]) -> None:
        """Ingest cabin telemetry (anemometer, camera, environment)."""
        self._cabin = SourceSnapshot(data=payload, received_at=time.time())

    def update_ocr(self, payload: Dict[str, Any]) -> None:
        """Ingest dashboard OCR telemetry (gauge readings)."""
        self._ocr = SourceSnapshot(data=payload, received_at=time.time())

    # ------------------------------------------------------------------
    # Fusion — produces FusedTelemetry dict
    # ------------------------------------------------------------------
    def fuse(self) -> Optional[Dict[str, Any]]:
        """Produce a fused telemetry message.  Returns None if no data at all."""
        now = time.time()
        self._discrepancies = []

        ocr_valid = self._is_fresh(self._ocr, MAX_OCR_AGE_S, now)
        boom_valid = self._is_fresh(self._boom, MAX_BOOM_AGE_S, now)
        cabin_valid = self._is_fresh(self._cabin, MAX_CABIN_AGE_S, now)

        if not ocr_valid and not boom_valid and not cabin_valid:
            return None  # total blackout — nothing to fuse

        # Determine priority path
        if ocr_valid and boom_valid:
            priority = DataPriority.P2_CROSS_VALIDATED
        elif ocr_valid:
            priority = DataPriority.P1_OCR
        else:
            priority = DataPriority.P3_FALLBACK

        # Build fused sections
        load = self._fuse_load(priority, now)
        position = self._fuse_position(priority, now)
        motion = self._fuse_motion(now)
        environment = self._fuse_environment(now)
        safety_flags = self._compute_safety_flags(load, environment, now)

        status = "valid"
        degradation_reason: Optional[str] = None
        if priority == DataPriority.P3_FALLBACK:
            status = "degraded"
            degradation_reason = "ocr_unavailable"
        elif self._discrepancies:
            status = "degraded"
            degradation_reason = "; ".join(self._discrepancies)

        self._sequence += 1
        return {
            "timestamp": now,
            "crane_id": self.crane_id,
            "sequence": self._sequence,
            "load": load,
            "position": position,
            "motion": motion,
            "environment": environment,
            "safety_flags": safety_flags,
            "status": status,
            "degradation_reason": degradation_reason,
        }

    # ------------------------------------------------------------------
    # Load fusion (P1 = OCR primary)
    # ------------------------------------------------------------------
    def _fuse_load(self, priority: DataPriority, now: float) -> Dict[str, Any]:
        ocr_load = self._extract_ocr_gauge("load")
        confidence = 0.0
        value = 0.0
        source = "none"
        ts_source = now

        if ocr_load is not None:
            value = ocr_load["raw_value"]
            confidence = ocr_load["confidence"]
            source = "ocr"
            ts_source = self._ocr.data.get("timestamp", now) if self._ocr else now

            # Cross-validate with IMU-derived load estimate if boom is fresh
            if priority == DataPriority.P2_CROSS_VALIDATED and self._boom:
                imu_load_est = self._estimate_load_from_imu()
                if imu_load_est is not None:
                    delta = abs(value - imu_load_est)
                    if delta > LOAD_DELTA_TONNES:
                        self._discrepancies.append(
                            f"load_delta={delta:.1f}t (ocr={value:.1f}, imu_est={imu_load_est:.1f})"
                        )
                        confidence *= 0.7
        elif self._boom:
            # P3 fallback — rough estimate from IMU
            imu_load_est = self._estimate_load_from_imu()
            if imu_load_est is not None:
                value = imu_load_est
                confidence = 0.4
                source = "imu_estimate"
                ts_source = self._boom.data.get("timestamp", now)

        return {
            "value_tonnes": round(value, 2),
            "source": source,
            "confidence": round(confidence, 3),
            "timestamp_source": ts_source,
        }

    # ------------------------------------------------------------------
    # Position fusion
    # ------------------------------------------------------------------
    def _fuse_position(self, priority: DataPriority, now: float) -> Dict[str, Any]:
        angle = 0.0
        distance = 0.0
        hook_height = 0.0
        source_angle = "none"
        source_distance = "none"
        confidence = 0.0

        ocr_angle = self._extract_ocr_gauge("boom_angle")
        ocr_radius = self._extract_ocr_gauge("radius")
        ocr_height = self._extract_ocr_gauge("height")

        if ocr_angle is not None:
            angle = ocr_angle["raw_value"]
            source_angle = "ocr"
            confidence = ocr_angle["confidence"]

        if self._boom:
            lidar = self._boom.data.get("lidar", {})
            lidar_dist_m = lidar.get("distance_mm", 0) / 1000.0
            if lidar_dist_m > 0:
                distance = lidar_dist_m
                source_distance = "lidar"
                if confidence == 0.0:
                    confidence = 0.7

            # Cross-validate OCR radius vs lidar
            if ocr_radius is not None and lidar_dist_m > 0:
                delta = abs(ocr_radius["raw_value"] - lidar_dist_m)
                if delta > RADIUS_DELTA_M:
                    self._discrepancies.append(
                        f"radius_delta={delta:.1f}m (ocr={ocr_radius['raw_value']:.1f}, lidar={lidar_dist_m:.1f})"
                    )
                    confidence *= 0.7

            # Use IMU euler for angle fallback
            if source_angle == "none":
                imu = self._boom.data.get("imu", {})
                pitch = imu.get("euler_pitch", 0)
                if pitch != 0:
                    angle = abs(pitch)
                    source_angle = "imu"
                    confidence = max(confidence, 0.5)

        # OCR height cross-validation with computed height
        if ocr_height is not None:
            hook_height = ocr_height["raw_value"]
            if distance > 0 and angle > 0:
                computed_height = distance * math.sin(math.radians(angle))
                delta = abs(hook_height - computed_height)
                if delta > HEIGHT_DELTA_M:
                    self._discrepancies.append(
                        f"height_delta={delta:.1f}m (ocr={hook_height:.1f}, computed={computed_height:.1f})"
                    )
        elif distance > 0 and angle > 0:
            hook_height = distance * math.sin(math.radians(angle))

        return {
            "boom_angle_degrees": round(angle, 2),
            "boom_distance_m": round(distance, 2),
            "hook_height_m": round(hook_height, 2),
            "source_angle": source_angle,
            "source_distance": source_distance,
            "confidence": round(confidence, 3),
        }

    # ------------------------------------------------------------------
    # Motion fusion (always from IMU)
    # ------------------------------------------------------------------
    def _fuse_motion(self, now: float) -> Dict[str, Any]:
        if self._boom and self._is_fresh(self._boom, MAX_BOOM_AGE_S, now):
            imu = self._boom.data.get("imu", {})
            return {
                "acceleration_vector": [
                    imu.get("accel_x", 0.0),
                    imu.get("accel_y", 0.0),
                    imu.get("accel_z", 0.0),
                ],
                "angular_velocity": [
                    imu.get("gyro_x", 0.0),
                    imu.get("gyro_y", 0.0),
                    imu.get("gyro_z", 0.0),
                ],
                "source": "imu",
            }
        return {
            "acceleration_vector": [0.0, 0.0, 0.0],
            "angular_velocity": [0.0, 0.0, 0.0],
            "source": "none",
        }

    # ------------------------------------------------------------------
    # Environment fusion
    # ------------------------------------------------------------------
    def _fuse_environment(self, now: float) -> Dict[str, Any]:
        wind_speed = 0.0
        wind_dir = 0.0
        temp = 0.0
        hazard_motion = False

        if self._cabin and self._is_fresh(self._cabin, MAX_CABIN_AGE_S, now):
            anemo = self._cabin.data.get("anemometer", {})
            wind_speed = anemo.get("wind_speed_kmh", 0.0)
            wind_dir = anemo.get("wind_direction_degrees", 0.0)
            env = self._cabin.data.get("environmental", {})
            temp = env.get("temperature_c", 0.0)

        if self._boom and self._is_fresh(self._boom, MAX_BOOM_AGE_S, now):
            radar = self._boom.data.get("radar", {})
            hazard_motion = radar.get("motion_detected", False)

        return {
            "wind_speed_kmh": round(wind_speed, 1),
            "wind_direction_degrees": round(wind_dir, 1),
            "temperature_c": round(temp, 1),
            "hazard_zone_motion": hazard_motion,
        }

    # ------------------------------------------------------------------
    # Safety flags
    # ------------------------------------------------------------------
    def _compute_safety_flags(
        self,
        load: Dict[str, Any],
        environment: Dict[str, Any],
        now: float,
    ) -> Dict[str, bool]:
        load_value = load.get("value_tonnes", 0.0)
        load_over = load_value > (self.rated_capacity_tonnes * LOAD_OVER_LIMIT_PCT)

        wind_speed = environment.get("wind_speed_kmh", 0.0)
        wind_excessive = wind_speed > WIND_CRITICAL_KMH

        # Operator presence from cabin camera
        operator_present = False
        operator_drowsy = False
        if self._cabin and self._is_fresh(self._cabin, MAX_CABIN_AGE_S, now):
            cam = self._cabin.data.get("cabin_camera", {})
            operator_present = cam.get("face_detected", False)
            # Drowsy detected by inference status from vision service (Phase 4)
            # For Phase 3 we check if inference_status is available
            operator_drowsy = cam.get("inference_status") == "processing"

        # Uncommanded motion from IMU
        uncommanded = False
        if self._boom and self._is_fresh(self._boom, MAX_BOOM_AGE_S, now):
            imu = self._boom.data.get("imu", {})
            accel_mag = math.sqrt(
                imu.get("accel_x", 0.0) ** 2
                + imu.get("accel_y", 0.0) ** 2
                + (imu.get("accel_z", 0.0) - 9.81) ** 2
            )
            uncommanded = accel_mag > 2.0  # >2 m/s² deviation from gravity

        return {
            "load_over_limit": load_over,
            "wind_excessive": wind_excessive,
            "operator_present": operator_present,
            "operator_drowsy": operator_drowsy,
            "uncommanded_motion": uncommanded,
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _is_fresh(self, snap: Optional[SourceSnapshot], max_age: float, now: float) -> bool:
        if snap is None:
            return False
        return (now - snap.received_at) <= max_age

    def _extract_ocr_gauge(self, gauge_name: str) -> Optional[Dict[str, Any]]:
        """Extract a specific gauge reading from the latest OCR snapshot."""
        if self._ocr is None:
            return None
        readings = self._ocr.data.get("readings", {})
        return readings.get(gauge_name)

    def _estimate_load_from_imu(self) -> Optional[float]:
        """Rough load estimate from IMU Z-axis deviation. Very approximate."""
        if self._boom is None:
            return None
        imu = self._boom.data.get("imu", {})
        accel_z = imu.get("accel_z", 9.81)
        # Under load, boom experiences increased Z-axis stress
        # This is a very rough proxy — real implementation uses strain gauges
        deviation = abs(accel_z - 9.81)
        if deviation < 0.1:
            return 0.0
        # Rough linear mapping: 1 m/s² deviation ≈ 5 tonnes (calibration-dependent)
        return round(deviation * 5.0, 1)

    @property
    def discrepancies(self) -> list[str]:
        return list(self._discrepancies)
