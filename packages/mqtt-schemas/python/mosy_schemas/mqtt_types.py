"""MOSY MQTT Message Types — Python dataclasses mirroring Blueprint Section 9."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple


# =============================================================================
# MQTT Topic Constants
# =============================================================================
class MQTT_TOPICS:
    BOOM_TELEMETRY = "mosy/{crane_id}/telemetry/boom"
    CABIN_TELEMETRY = "mosy/{crane_id}/telemetry/cabin"
    OCR_TELEMETRY = "mosy/{crane_id}/telemetry/ocr"
    FUSED_TELEMETRY = "mosy/{crane_id}/telemetry/fused"
    BOOM_VISION = "mosy/{crane_id}/vision/boom"
    CABIN_VISION = "mosy/{crane_id}/vision/cabin"
    ALERT = "mosy/{crane_id}/alerts/{level}"
    LIFT_STATE = "mosy/{crane_id}/state/lift"
    OPERATOR_STATE = "mosy/{crane_id}/state/operator"
    ENGINE_STATE = "mosy/{crane_id}/state/engine"
    CALIBRATION = "mosy/{crane_id}/config/calibration"
    COMMAND = "mosy/{crane_id}/commands/{target}"
    DIAGNOSTICS = "mosy/{crane_id}/diagnostics/{component}"


def build_topic(template: str, **kwargs: str) -> str:
    """Build a concrete MQTT topic from a template with named placeholders."""
    topic = template
    for key, value in kwargs.items():
        topic = topic.replace(f"{{{key}}}", value)
    return topic


# =============================================================================
# Enums
# =============================================================================
class LidarStatus(str, Enum):
    GOOD = "good"
    WEAK = "weak"
    OUT_OF_RANGE = "out_of_range"


class PresenceStatus(str, Enum):
    STATIONARY = "stationary"
    MOVING = "moving"
    NONE = "none"


class AnemometerStatus(str, Enum):
    GOOD = "good"
    ERROR = "error"


class InferenceStatus(str, Enum):
    PROCESSING = "processing"
    READY = "ready"
    ERROR = "error"


class TelemetryStatus(str, Enum):
    VALID = "valid"
    DEGRADED = "degraded"
    ERROR = "error"


class AlertLevel(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertSource(str, Enum):
    OCR = "ocr"
    IMU = "imu"
    LIDAR = "lidar"
    CAMERA = "camera"
    SYSTEM = "system"


class LiftState(str, Enum):
    IDLE = "idle"
    LOADING = "loading"
    HOISTING = "hoisting"
    LOWERING = "lowering"
    UNLOADING = "unloading"
    FAULT = "fault"


class OperatorPresenceState(str, Enum):
    ABSENT = "absent"
    PRESENT = "present"
    FATIGUED = "fatigued"
    ALERT = "alert"


class EngineState(str, Enum):
    OFF = "off"
    STARTING = "starting"
    RUNNING = "running"
    FAULT = "fault"


class CommandTarget(str, Enum):
    ESP32 = "esp32"
    RPI5 = "rpi5"
    JETSON = "jetson"


class ComponentHealth(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    ERROR = "error"
    OFFLINE = "offline"


class GaugeMethod(str, Enum):
    DIGITAL = "digital"
    ANALOG = "analog"


class OcrEngine(str, Enum):
    PADDLEOCR = "paddleocr"
    TESSERACT = "tesseract"


class GazeDirection(str, Enum):
    FORWARD = "forward"
    RIGHT = "right"
    LEFT = "left"
    DOWN = "down"
    UNKNOWN = "unknown"


class Hardware(str, Enum):
    JETSON = "jetson"
    GPU = "gpu"
    CPU = "cpu"


# =============================================================================
# Sub-structures
# =============================================================================
@dataclass
class LidarReading:
    distance_mm: float
    signal_strength: float
    status: LidarStatus


@dataclass
class ImuReading:
    accel_x: float
    accel_y: float
    accel_z: float
    gyro_x: float
    gyro_y: float
    gyro_z: float
    mag_x: float
    mag_y: float
    mag_z: float
    euler_roll: float
    euler_pitch: float
    euler_yaw: float
    temperature: float


@dataclass
class RadarReading:
    motion_detected: bool
    distance_m: float
    target_count: int
    presence_status: PresenceStatus


@dataclass
class AnemometerReading:
    wind_speed_kmh: float
    wind_direction_degrees: float
    status: AnemometerStatus


@dataclass
class BoundingBox:
    x: float
    y: float
    width: float
    height: float


@dataclass
class CabinCameraStatus:
    inference_status: InferenceStatus
    face_detected: bool
    face_confidence: float
    face_bounding_box: Optional[BoundingBox]


@dataclass
class EnvironmentalReading:
    temperature_c: float
    humidity_percent: float
    cabin_door_open: bool
    seatbelt_fastened: Optional[bool]


@dataclass
class GaugeReading:
    raw_value: float
    unit: str
    confidence: float
    method: GaugeMethod
    roi_used: str


@dataclass
class OcrQualityMetrics:
    image_brightness: float
    contrast: float
    blur_score: float
    ocr_engine_version: str


@dataclass
class FusedLoad:
    value_tonnes: float
    source: str  # always "ocr"
    confidence: float
    timestamp_source: float


@dataclass
class FusedPosition:
    boom_angle_degrees: float
    boom_distance_m: float
    hook_height_m: float
    source_angle: str  # always "ocr"
    source_distance: str  # always "lidar"
    confidence: float


@dataclass
class FusedMotion:
    acceleration_vector: Tuple[float, float, float]
    angular_velocity: Tuple[float, float, float]
    source: str  # always "imu"


@dataclass
class FusedEnvironment:
    wind_speed_kmh: float
    wind_direction_degrees: float
    temperature_c: float
    hazard_zone_motion: bool


@dataclass
class SafetyFlags:
    load_over_limit: bool
    wind_excessive: bool
    operator_present: bool
    operator_drowsy: bool
    uncommanded_motion: bool


@dataclass
class Detection:
    class_id: str
    class_label: str
    confidence: float
    bounding_box: BoundingBox
    metadata: Optional[Dict[str, str | float]] = None


@dataclass
class OperatorVisionState:
    present: bool
    face_detected: bool
    face_confidence: float
    gaze_direction: Optional[GazeDirection] = None
    mouth_open: Optional[bool] = None
    mouth_confidence: Optional[float] = None


@dataclass
class CabinEnvironmental:
    cabin_cluttered: bool
    distractions: List[str]


@dataclass
class GaugeCalibration:
    type: GaugeMethod
    roi: BoundingBox
    scale_min: float
    scale_max: float
    unit: str
    decimal_places: int
    ocr_engine: OcrEngine


@dataclass
class SensorOffsets:
    lidar_offset_mm: float
    imu_gyro_bias_x: float
    imu_gyro_bias_y: float
    imu_gyro_bias_z: float


@dataclass
class SafetyLimits:
    max_load_tonnes: float
    max_boom_angle_degrees: float
    max_wind_kmh: float
    min_visibility_percent: float


# =============================================================================
# Top-Level MQTT Messages
# =============================================================================
@dataclass
class BoomTelemetry:
    timestamp: float
    crane_id: str
    sequence: int
    lidar: LidarReading
    imu: ImuReading
    radar: RadarReading


@dataclass
class CabinTelemetry:
    timestamp: float
    crane_id: str
    sequence: int
    anemometer: AnemometerReading
    cabin_camera: CabinCameraStatus
    environmental: EnvironmentalReading


@dataclass
class DashboardOCR:
    timestamp: float
    crane_id: str
    sequence: int
    readings: Dict[str, GaugeReading]
    quality_metrics: OcrQualityMetrics
    calibration_profile_id: str
    processing_time_ms: float


@dataclass
class FusedTelemetry:
    timestamp: float
    crane_id: str
    sequence: int
    load: FusedLoad
    position: FusedPosition
    motion: FusedMotion
    environment: FusedEnvironment
    safety_flags: SafetyFlags
    status: TelemetryStatus
    degradation_reason: Optional[str] = None


@dataclass
class BoomCameraInference:
    timestamp: float
    crane_id: str
    inference_id: str
    model_name: str  # "moondream2-0.5b"
    detections: List[Detection]
    caption: str
    processing_time_ms: float
    hardware: Hardware


@dataclass
class CabinCameraInference:
    timestamp: float
    crane_id: str
    inference_id: str
    model_name: str  # "moondream2-0.5b"
    operator_state: OperatorVisionState
    environmental: CabinEnvironmental
    caption: str
    processing_time_ms: float


@dataclass
class AlertMessage:
    timestamp: float
    crane_id: str
    alert_id: str
    level: AlertLevel
    type: str
    title: str
    description: str
    source: AlertSource
    values: Dict[str, float | str | bool]
    acknowledgement_required: bool
    auto_recovery: bool
    actions: Optional[List[str]] = None


@dataclass
class LiftStateUpdate:
    timestamp: float
    crane_id: str
    previous_state: LiftState
    current_state: LiftState
    transition_reason: str
    load_at_transition: float
    metadata: Optional[Dict[str, object]] = None


@dataclass
class OperatorStateUpdate:
    timestamp: float
    crane_id: str
    previous_state: OperatorPresenceState
    current_state: OperatorPresenceState
    perclos_score: float
    confidence: float
    metadata: Optional[Dict[str, float]] = None


@dataclass
class EngineStateUpdate:
    timestamp: float
    crane_id: str
    previous_state: EngineState
    current_state: EngineState
    engine_temperature_c: float
    engine_rpm: float
    idle_duration_minutes: float


@dataclass
class CalibrationUpdate:
    timestamp: float
    crane_id: str
    calibration_id: str
    effective_timestamp: float
    gauges: Dict[str, GaugeCalibration]
    sensor_offsets: SensorOffsets
    safety_limits: SafetyLimits
    approved_by: str
    signature: Optional[str] = None


@dataclass
class CommandMessage:
    timestamp: float
    crane_id: str
    command_id: str
    target: CommandTarget
    action: str
    parameters: Dict[str, object]
    timeout_seconds: float
    requires_acknowledgement: bool


@dataclass
class DiagnosticMessage:
    timestamp: float
    crane_id: str
    component: str
    status: ComponentHealth
    uptime_seconds: float
    metrics: Dict[str, float | str]
    last_sync: float
    error_code: Optional[str] = None
    error_message: Optional[str] = None
