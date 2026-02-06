// =============================================================================
// MOSY MQTT Message Types — Blueprint Section 9
// All MQTT topics: mosy/{crane_id}/...
// =============================================================================

// ---------------------------------------------------------------------------
// mosy/{crane_id}/telemetry/boom — 10Hz from ESP32-S3
// ---------------------------------------------------------------------------
export interface LidarReading {
  distance_mm: number;
  signal_strength: number;
  status: 'good' | 'weak' | 'out_of_range';
}

export interface ImuReading {
  accel_x: number;
  accel_y: number;
  accel_z: number;
  gyro_x: number;
  gyro_y: number;
  gyro_z: number;
  mag_x: number;
  mag_y: number;
  mag_z: number;
  euler_roll: number;
  euler_pitch: number;
  euler_yaw: number;
  temperature: number;
}

export interface RadarReading {
  motion_detected: boolean;
  distance_m: number;
  target_count: number;
  presence_status: 'stationary' | 'moving' | 'none';
}

export interface BoomTelemetry {
  timestamp: number;
  crane_id: string;
  sequence: number;
  lidar: LidarReading;
  imu: ImuReading;
  radar: RadarReading;
}

// ---------------------------------------------------------------------------
// mosy/{crane_id}/telemetry/cabin — 10Hz from RPi5
// ---------------------------------------------------------------------------
export interface AnemometerReading {
  wind_speed_kmh: number;
  wind_direction_degrees: number;
  status: 'good' | 'error';
}

export interface CabinCameraStatus {
  inference_status: 'processing' | 'ready' | 'error';
  face_detected: boolean;
  face_confidence: number;
  face_bounding_box: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

export interface EnvironmentalReading {
  temperature_c: number;
  humidity_percent: number;
  cabin_door_open: boolean;
  seatbelt_fastened: boolean | null;
}

export interface CabinTelemetry {
  timestamp: number;
  crane_id: string;
  sequence: number;
  anemometer: AnemometerReading;
  cabin_camera: CabinCameraStatus;
  environmental: EnvironmentalReading;
}

// ---------------------------------------------------------------------------
// mosy/{crane_id}/telemetry/ocr — 2-5Hz from Jetson OCR service
// ---------------------------------------------------------------------------
export interface GaugeReading {
  raw_value: number;
  unit: string;
  confidence: number;
  method: 'digital' | 'analog';
  roi_used: string;
}

export interface OcrQualityMetrics {
  image_brightness: number;
  contrast: number;
  blur_score: number;
  ocr_engine_version: string;
}

export interface DashboardOCR {
  timestamp: number;
  crane_id: string;
  sequence: number;
  readings: Record<string, GaugeReading>;
  quality_metrics: OcrQualityMetrics;
  calibration_profile_id: string;
  processing_time_ms: number;
}

// ---------------------------------------------------------------------------
// mosy/{crane_id}/telemetry/fused — 1Hz from Jetson fusion service
// ---------------------------------------------------------------------------
export interface FusedLoad {
  value_tonnes: number;
  source: 'ocr';
  confidence: number;
  timestamp_source: number;
}

export interface FusedPosition {
  boom_angle_degrees: number;
  boom_distance_m: number;
  hook_height_m: number;
  source_angle: 'ocr';
  source_distance: 'lidar';
  confidence: number;
}

export interface FusedMotion {
  acceleration_vector: [number, number, number];
  angular_velocity: [number, number, number];
  source: 'imu';
}

export interface FusedEnvironment {
  wind_speed_kmh: number;
  wind_direction_degrees: number;
  temperature_c: number;
  hazard_zone_motion: boolean;
}

export interface SafetyFlags {
  load_over_limit: boolean;
  wind_excessive: boolean;
  operator_present: boolean;
  operator_drowsy: boolean;
  uncommanded_motion: boolean;
}

export type TelemetryStatus = 'valid' | 'degraded' | 'error';

export interface FusedTelemetry {
  timestamp: number;
  crane_id: string;
  sequence: number;
  load: FusedLoad;
  position: FusedPosition;
  motion: FusedMotion;
  environment: FusedEnvironment;
  safety_flags: SafetyFlags;
  status: TelemetryStatus;
  degradation_reason?: string;
}

// ---------------------------------------------------------------------------
// mosy/{crane_id}/vision/boom — from Jetson vision service
// ---------------------------------------------------------------------------
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Detection {
  class_id: string;
  class_label: string;
  confidence: number;
  bounding_box: BoundingBox;
  metadata?: Record<string, string | number>;
}

export interface BoomCameraInference {
  timestamp: number;
  crane_id: string;
  inference_id: string;
  model_name: 'moondream2-0.5b';
  detections: Detection[];
  caption: string;
  processing_time_ms: number;
  hardware: 'jetson' | 'gpu' | 'cpu';
}

// ---------------------------------------------------------------------------
// mosy/{crane_id}/vision/cabin — from Jetson safety service
// ---------------------------------------------------------------------------
export interface OperatorVisionState {
  present: boolean;
  face_detected: boolean;
  face_confidence: number;
  gaze_direction?: 'forward' | 'right' | 'left' | 'down' | 'unknown';
  mouth_open?: boolean;
  mouth_confidence?: number;
}

export interface CabinEnvironmental {
  cabin_cluttered: boolean;
  distractions: string[];
}

export interface CabinCameraInference {
  timestamp: number;
  crane_id: string;
  inference_id: string;
  model_name: 'moondream2-0.5b';
  operator_state: OperatorVisionState;
  environmental: CabinEnvironmental;
  caption: string;
  processing_time_ms: number;
}

// ---------------------------------------------------------------------------
// mosy/{crane_id}/alerts/{level} — from Jetson safety/fusion
// ---------------------------------------------------------------------------
export type AlertLevel = 'info' | 'warning' | 'critical';
export type AlertSource = 'ocr' | 'imu' | 'lidar' | 'camera' | 'system';

export interface AlertMessage {
  timestamp: number;
  crane_id: string;
  alert_id: string;
  level: AlertLevel;
  type: string;
  title: string;
  description: string;
  source: AlertSource;
  values: Record<string, number | string | boolean>;
  acknowledgement_required: boolean;
  auto_recovery: boolean;
  actions?: string[];
}

// ---------------------------------------------------------------------------
// mosy/{crane_id}/state/lift
// ---------------------------------------------------------------------------
export type LiftState = 'idle' | 'loading' | 'hoisting' | 'lowering' | 'unloading' | 'fault';

export interface LiftStateUpdate {
  timestamp: number;
  crane_id: string;
  previous_state: LiftState;
  current_state: LiftState;
  transition_reason: string;
  load_at_transition: number;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// mosy/{crane_id}/state/operator
// ---------------------------------------------------------------------------
export type OperatorPresenceState = 'absent' | 'present' | 'fatigued' | 'alert';

export interface OperatorStateUpdate {
  timestamp: number;
  crane_id: string;
  previous_state: OperatorPresenceState;
  current_state: OperatorPresenceState;
  perclos_score: number;
  confidence: number;
  metadata?: {
    shift_duration_minutes: number;
    last_break_minutes_ago: number;
  };
}

// ---------------------------------------------------------------------------
// mosy/{crane_id}/state/engine
// ---------------------------------------------------------------------------
export type EngineState = 'off' | 'starting' | 'running' | 'fault';

export interface EngineStateUpdate {
  timestamp: number;
  crane_id: string;
  previous_state: EngineState;
  current_state: EngineState;
  engine_temperature_c: number;
  engine_rpm: number;
  idle_duration_minutes: number;
}

// ---------------------------------------------------------------------------
// mosy/{crane_id}/config/calibration
// ---------------------------------------------------------------------------
export interface GaugeCalibration {
  type: 'digital' | 'analog';
  roi: BoundingBox;
  scale_min: number;
  scale_max: number;
  unit: string;
  decimal_places: number;
  ocr_engine: 'paddleocr' | 'tesseract';
}

export interface SensorOffsets {
  lidar_offset_mm: number;
  imu_gyro_bias_x: number;
  imu_gyro_bias_y: number;
  imu_gyro_bias_z: number;
}

export interface SafetyLimits {
  max_load_tonnes: number;
  max_boom_angle_degrees: number;
  max_wind_kmh: number;
  min_visibility_percent: number;
}

export interface CalibrationUpdate {
  timestamp: number;
  crane_id: string;
  calibration_id: string;
  effective_timestamp: number;
  gauges: Record<string, GaugeCalibration>;
  sensor_offsets: SensorOffsets;
  safety_limits: SafetyLimits;
  approved_by: string;
  signature?: string;
}

// ---------------------------------------------------------------------------
// mosy/{crane_id}/commands/{target}
// ---------------------------------------------------------------------------
export type CommandTarget = 'esp32' | 'rpi5' | 'jetson';

export interface CommandMessage {
  timestamp: number;
  crane_id: string;
  command_id: string;
  target: CommandTarget;
  action: string;
  parameters: Record<string, unknown>;
  timeout_seconds: number;
  requires_acknowledgement: boolean;
}

// ---------------------------------------------------------------------------
// mosy/{crane_id}/diagnostics/{component}
// ---------------------------------------------------------------------------
export type ComponentHealth = 'healthy' | 'degraded' | 'error' | 'offline';

export interface DiagnosticMessage {
  timestamp: number;
  crane_id: string;
  component: string;
  status: ComponentHealth;
  uptime_seconds: number;
  metrics: Record<string, number | string>;
  last_sync: number;
  error_code?: string;
  error_message?: string;
}

// ---------------------------------------------------------------------------
// MQTT Topic Constants
// ---------------------------------------------------------------------------
export const MQTT_TOPICS = {
  BOOM_TELEMETRY: 'mosy/{crane_id}/telemetry/boom',
  CABIN_TELEMETRY: 'mosy/{crane_id}/telemetry/cabin',
  OCR_TELEMETRY: 'mosy/{crane_id}/telemetry/ocr',
  FUSED_TELEMETRY: 'mosy/{crane_id}/telemetry/fused',
  BOOM_VISION: 'mosy/{crane_id}/vision/boom',
  CABIN_VISION: 'mosy/{crane_id}/vision/cabin',
  ALERT: 'mosy/{crane_id}/alerts/{level}',
  LIFT_STATE: 'mosy/{crane_id}/state/lift',
  OPERATOR_STATE: 'mosy/{crane_id}/state/operator',
  ENGINE_STATE: 'mosy/{crane_id}/state/engine',
  CALIBRATION: 'mosy/{crane_id}/config/calibration',
  COMMAND: 'mosy/{crane_id}/commands/{target}',
  DIAGNOSTICS: 'mosy/{crane_id}/diagnostics/{component}',
} as const;

/** Build a concrete topic string by replacing placeholders. */
export function buildTopic(
  template: string,
  params: Record<string, string>,
): string {
  let topic = template;
  for (const [key, value] of Object.entries(params)) {
    topic = topic.replace(`{${key}}`, value);
  }
  return topic;
}
