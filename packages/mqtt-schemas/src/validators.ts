// =============================================================================
// Zod Validation Schemas for MQTT Messages
// =============================================================================

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------
const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

// ---------------------------------------------------------------------------
// BoomTelemetry
// ---------------------------------------------------------------------------
export const BoomTelemetrySchema = z.object({
  timestamp: z.number(),
  crane_id: z.string(),
  sequence: z.number().int(),
  lidar: z.object({
    distance_mm: z.number(),
    signal_strength: z.number().min(0).max(100),
    status: z.enum(['good', 'weak', 'out_of_range']),
  }),
  imu: z.object({
    accel_x: z.number(),
    accel_y: z.number(),
    accel_z: z.number(),
    gyro_x: z.number(),
    gyro_y: z.number(),
    gyro_z: z.number(),
    mag_x: z.number(),
    mag_y: z.number(),
    mag_z: z.number(),
    euler_roll: z.number(),
    euler_pitch: z.number(),
    euler_yaw: z.number(),
    temperature: z.number(),
  }),
  radar: z.object({
    motion_detected: z.boolean(),
    distance_m: z.number(),
    target_count: z.number().int().min(0),
    presence_status: z.enum(['stationary', 'moving', 'none']),
  }),
});

// ---------------------------------------------------------------------------
// CabinTelemetry
// ---------------------------------------------------------------------------
export const CabinTelemetrySchema = z.object({
  timestamp: z.number(),
  crane_id: z.string(),
  sequence: z.number().int(),
  anemometer: z.object({
    wind_speed_kmh: z.number().min(0),
    wind_direction_degrees: z.number().min(0).max(360),
    status: z.enum(['good', 'error']),
  }),
  cabin_camera: z.object({
    inference_status: z.enum(['processing', 'ready', 'error']),
    face_detected: z.boolean(),
    face_confidence: z.number().min(0).max(1),
    face_bounding_box: BoundingBoxSchema.nullable(),
  }),
  environmental: z.object({
    temperature_c: z.number(),
    humidity_percent: z.number().min(0).max(100),
    cabin_door_open: z.boolean(),
    seatbelt_fastened: z.boolean().nullable(),
  }),
});

// ---------------------------------------------------------------------------
// DashboardOCR
// ---------------------------------------------------------------------------
export const DashboardOCRSchema = z.object({
  timestamp: z.number(),
  crane_id: z.string(),
  sequence: z.number().int(),
  readings: z.record(
    z.string(),
    z.object({
      raw_value: z.number(),
      unit: z.string(),
      confidence: z.number().min(0).max(1),
      method: z.enum(['digital', 'analog']),
      roi_used: z.string(),
    }),
  ),
  quality_metrics: z.object({
    image_brightness: z.number().min(0).max(255),
    contrast: z.number().min(0).max(1),
    blur_score: z.number().min(0).max(1),
    ocr_engine_version: z.string(),
  }),
  calibration_profile_id: z.string(),
  processing_time_ms: z.number().min(0),
});

// ---------------------------------------------------------------------------
// FusedTelemetry
// ---------------------------------------------------------------------------
export const FusedTelemetrySchema = z.object({
  timestamp: z.number(),
  crane_id: z.string(),
  sequence: z.number().int(),
  load: z.object({
    value_tonnes: z.number().min(0),
    source: z.literal('ocr'),
    confidence: z.number().min(0).max(1),
    timestamp_source: z.number(),
  }),
  position: z.object({
    boom_angle_degrees: z.number(),
    boom_distance_m: z.number().min(0),
    hook_height_m: z.number(),
    source_angle: z.literal('ocr'),
    source_distance: z.literal('lidar'),
    confidence: z.number().min(0).max(1),
  }),
  motion: z.object({
    acceleration_vector: z.tuple([z.number(), z.number(), z.number()]),
    angular_velocity: z.tuple([z.number(), z.number(), z.number()]),
    source: z.literal('imu'),
  }),
  environment: z.object({
    wind_speed_kmh: z.number().min(0),
    wind_direction_degrees: z.number().min(0).max(360),
    temperature_c: z.number(),
    hazard_zone_motion: z.boolean(),
  }),
  safety_flags: z.object({
    load_over_limit: z.boolean(),
    wind_excessive: z.boolean(),
    operator_present: z.boolean(),
    operator_drowsy: z.boolean(),
    uncommanded_motion: z.boolean(),
  }),
  status: z.enum(['valid', 'degraded', 'error']),
  degradation_reason: z.string().optional(),
});

// ---------------------------------------------------------------------------
// AlertMessage
// ---------------------------------------------------------------------------
export const AlertMessageSchema = z.object({
  timestamp: z.number(),
  crane_id: z.string(),
  alert_id: z.string(),
  level: z.enum(['info', 'warning', 'critical']),
  type: z.string(),
  title: z.string(),
  description: z.string(),
  source: z.enum(['ocr', 'imu', 'lidar', 'camera', 'system']),
  values: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
  acknowledgement_required: z.boolean(),
  auto_recovery: z.boolean(),
  actions: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// State Updates
// ---------------------------------------------------------------------------
export const LiftStateUpdateSchema = z.object({
  timestamp: z.number(),
  crane_id: z.string(),
  previous_state: z.enum(['idle', 'loading', 'hoisting', 'lowering', 'unloading', 'fault']),
  current_state: z.enum(['idle', 'loading', 'hoisting', 'lowering', 'unloading', 'fault']),
  transition_reason: z.string(),
  load_at_transition: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const OperatorStateUpdateSchema = z.object({
  timestamp: z.number(),
  crane_id: z.string(),
  previous_state: z.enum(['absent', 'present', 'fatigued', 'alert']),
  current_state: z.enum(['absent', 'present', 'fatigued', 'alert']),
  perclos_score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  metadata: z
    .object({
      shift_duration_minutes: z.number(),
      last_break_minutes_ago: z.number(),
    })
    .optional(),
});

export const EngineStateUpdateSchema = z.object({
  timestamp: z.number(),
  crane_id: z.string(),
  previous_state: z.enum(['off', 'starting', 'running', 'fault']),
  current_state: z.enum(['off', 'starting', 'running', 'fault']),
  engine_temperature_c: z.number(),
  engine_rpm: z.number().min(0),
  idle_duration_minutes: z.number().min(0),
});

// ---------------------------------------------------------------------------
// CalibrationUpdate
// ---------------------------------------------------------------------------
export const CalibrationUpdateSchema = z.object({
  timestamp: z.number(),
  crane_id: z.string(),
  calibration_id: z.string(),
  effective_timestamp: z.number(),
  gauges: z.record(
    z.string(),
    z.object({
      type: z.enum(['digital', 'analog']),
      roi: BoundingBoxSchema,
      scale_min: z.number(),
      scale_max: z.number(),
      unit: z.string(),
      decimal_places: z.number().int().min(0),
      ocr_engine: z.enum(['paddleocr', 'tesseract']),
    }),
  ),
  sensor_offsets: z.object({
    lidar_offset_mm: z.number(),
    imu_gyro_bias_x: z.number(),
    imu_gyro_bias_y: z.number(),
    imu_gyro_bias_z: z.number(),
  }),
  safety_limits: z.object({
    max_load_tonnes: z.number().positive(),
    max_boom_angle_degrees: z.number().positive(),
    max_wind_kmh: z.number().positive(),
    min_visibility_percent: z.number().min(0).max(100),
  }),
  approved_by: z.string(),
  signature: z.string().optional(),
});

// ---------------------------------------------------------------------------
// CommandMessage
// ---------------------------------------------------------------------------
export const CommandMessageSchema = z.object({
  timestamp: z.number(),
  crane_id: z.string(),
  command_id: z.string(),
  target: z.enum(['esp32', 'rpi5', 'jetson']),
  action: z.string(),
  parameters: z.record(z.string(), z.unknown()),
  timeout_seconds: z.number().positive(),
  requires_acknowledgement: z.boolean(),
});

// ---------------------------------------------------------------------------
// DiagnosticMessage
// ---------------------------------------------------------------------------
export const DiagnosticMessageSchema = z.object({
  timestamp: z.number(),
  crane_id: z.string(),
  component: z.string(),
  status: z.enum(['healthy', 'degraded', 'error', 'offline']),
  uptime_seconds: z.number().min(0),
  metrics: z.record(z.string(), z.union([z.number(), z.string()])),
  last_sync: z.number(),
  error_code: z.string().optional(),
  error_message: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Generic validator
// ---------------------------------------------------------------------------
const TOPIC_SCHEMA_MAP: Record<string, z.ZodSchema> = {
  'telemetry/boom': BoomTelemetrySchema,
  'telemetry/cabin': CabinTelemetrySchema,
  'telemetry/ocr': DashboardOCRSchema,
  'telemetry/fused': FusedTelemetrySchema,
  'vision/boom': z.any(),
  'vision/cabin': z.any(),
  'alerts/info': AlertMessageSchema,
  'alerts/warning': AlertMessageSchema,
  'alerts/critical': AlertMessageSchema,
  'state/lift': LiftStateUpdateSchema,
  'state/operator': OperatorStateUpdateSchema,
  'state/engine': EngineStateUpdateSchema,
  'config/calibration': CalibrationUpdateSchema,
  'diagnostics': DiagnosticMessageSchema,
};

/**
 * Validate an MQTT message payload against its schema.
 * @param topicSuffix - The topic suffix after mosy/{crane_id}/ (e.g., "telemetry/boom")
 * @param payload - The parsed JSON payload
 * @returns The validated payload or throws ZodError
 */
export function validateMqttMessage<T>(topicSuffix: string, payload: unknown): T {
  const schema = TOPIC_SCHEMA_MAP[topicSuffix];
  if (!schema) {
    throw new Error(`No schema registered for topic suffix: ${topicSuffix}`);
  }
  return schema.parse(payload) as T;
}
