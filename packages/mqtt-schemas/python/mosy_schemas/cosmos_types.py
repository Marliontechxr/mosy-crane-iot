"""MOSY Cosmos DB Document Types — Python dataclasses mirroring Blueprint Section 15."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple


COSMOS_DATABASE = "mosydb"

COSMOS_CONTAINERS = {
    "TELEMETRY": {"name": "telemetry", "partition_key": "/craneId", "ttl_days": 90},
    "ALERTS": {"name": "alerts", "partition_key": "/craneId", "ttl_days": None},
    "SHIFTS": {"name": "shifts", "partition_key": "/operatorId", "ttl_days": None},
    "LIFTS": {"name": "lifts", "partition_key": "/craneId", "ttl_days": 365},
    "CRANES": {"name": "cranes", "partition_key": "/siteId", "ttl_days": None},
    "OPERATORS": {"name": "operators", "partition_key": "/siteId", "ttl_days": None},
    "SITES": {"name": "sites", "partition_key": "/organizationId", "ttl_days": None},
    "CALIBRATIONS": {"name": "calibrations", "partition_key": "/craneId", "ttl_days": None},
    "DIAGNOSTICS": {"name": "diagnostics", "partition_key": "/craneId", "ttl_days": 30},
    "INCIDENTS": {"name": "incidents", "partition_key": "/siteId", "ttl_days": None},
}


class CraneType(str, Enum):
    MOBILE = "mobile"
    TOWER = "tower"
    OVERHEAD = "overhead"


class CraneStatus(str, Enum):
    ACTIVE = "active"
    MAINTENANCE = "maintenance"
    RETIRED = "retired"


class OperatorStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


class IncidentType(str, Enum):
    SAFETY_VIOLATION = "safety_violation"
    EQUIPMENT_FAILURE = "equipment_failure"
    NEAR_MISS = "near_miss"
    ACCIDENT = "accident"


class IncidentSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class TelemetryDocument:
    id: str
    craneId: str
    siteId: str
    timestamp: float
    sequence: int
    load: dict  # {value_tonnes, max_safe_tonnes, percent, confidence, source}
    position: dict  # {boom_angle_degrees, boom_distance_m, hook_height_m, confidence}
    motion: dict  # {acceleration_x/y/z, angular_velocity_x/y/z}
    environment: dict  # {wind_speed_kmh, temperature_c, hazard_zone_motion}
    safety_flags: dict  # {load_over_limit, wind_excessive, ...}
    status: str  # "valid" | "degraded" | "error"
    ttl: int


@dataclass
class AlertDocument:
    id: str
    craneId: str
    siteId: str
    alertId: str
    timestamp: float
    level: str  # "info" | "warning" | "critical"
    type: str
    title: str
    description: str
    source: str  # "ocr" | "imu" | "lidar" | "camera" | "system"
    values: Dict[str, object]
    acknowledged: bool
    actions: List[str]
    auto_recovery: bool
    created_at: float
    acknowledged_at: Optional[float] = None
    acknowledged_by: Optional[str] = None


@dataclass
class ShiftDocument:
    id: str
    operatorId: str
    siteId: str
    craneId: str
    shift_start: float
    shift_end: float
    shift_duration_minutes: float
    status: str  # "in_progress" | "completed" | "abandoned"
    lifts: dict  # {count, total_tonnage, avg_load_tonnage, max_load_tonnage}
    performance: dict  # {score, safety_incidents, near_misses, fatigue_incidents}
    operator: dict  # {name, id, employee_id}
    environmental: dict  # {avg_wind_speed_kmh, max_wind_speed_kmh, temperature_range}
    notes: str
    created_at: float


@dataclass
class LiftDocument:
    id: str
    craneId: str
    siteId: str
    lift_number: int
    lift_start: float
    lift_end: float
    duration_seconds: float
    status: str  # "completed" | "aborted" | "partial"
    load: dict  # {weight_tonnes, max_safe_tonnes, percent_of_max, material_type?}
    operator: dict  # {id, name, perclos_avg, fatigue_incidents}
    boom: dict  # {angle_start, angle_end, max_angle, distance_m}
    safety: dict  # {load_limit_exceeded, wind_hazard, operator_fatigue_detected, anomalies}
    shift_id: str
    created_at: float


@dataclass
class CraneDocument:
    id: str
    siteId: str
    crane_id: str
    name: str
    crane_type: CraneType
    max_load_tonnes: float
    boom_length_m: float
    location: dict  # {site_name, latitude, longitude}
    hardware: dict  # {jetson_device_id, rpi5_device_id, esp32_device_ids}
    sensors: dict  # {lidar_model, imu_model, camera_count}
    status: CraneStatus
    last_calibration: float
    created_at: float


@dataclass
class OperatorDocument:
    id: str
    siteId: str
    operator_id: str
    name: str
    email: str
    phone: str
    employee_id: str
    department: str
    certifications: dict  # {mobile_crane, tower_crane, overhead_crane, expires}
    performance_metrics: dict  # {total_lifts, total_tonnage, safety_score, avg_lift_duration_minutes}
    status: OperatorStatus
    hire_date: float
    created_at: float


@dataclass
class SiteDocument:
    id: str
    organizationId: str
    site_id: str
    name: str
    location: dict  # {address, city, state, latitude, longitude}
    crane_ids: List[str]
    manager_ids: List[str]
    status: str  # "active" | "inactive"
    created_at: float


@dataclass
class CalibrationDocument:
    id: str
    craneId: str
    siteId: str
    calibration_id: str
    effective_from: float
    created_at: float
    approved_by: str
    version: int
    gauges: Dict[str, dict]  # gauge_name -> {type, roi, scale_min, scale_max, unit, ...}
    sensor_offsets: dict  # {lidar_offset_mm, imu_gyro_bias}
    safety_limits: dict  # {max_load_tonnes, max_boom_angle_degrees, max_wind_kmh}


@dataclass
class DiagnosticsDocument:
    id: str
    craneId: str
    siteId: str
    component: str
    status: str  # "healthy" | "degraded" | "error" | "offline"
    timestamp: float
    uptime_seconds: float
    metrics: Dict[str, float | str]
    ttl: int
    error_code: Optional[str] = None
    error_message: Optional[str] = None


@dataclass
class IncidentDocument:
    id: str
    siteId: str
    craneId: str
    incident_id: str
    timestamp: float
    type: IncidentType
    severity: IncidentSeverity
    title: str
    description: str
    alert_ids: List[str]
    resolution: str
    attachments: List[str]
    created_at: float
    operator_id: Optional[str] = None
    resolved_at: Optional[float] = None
    resolved_by: Optional[str] = None
