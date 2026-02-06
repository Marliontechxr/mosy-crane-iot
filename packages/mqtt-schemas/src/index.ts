// =============================================================================
// @mosy/mqtt-schemas — Re-export MQTT types + Zod validators
// =============================================================================

// Re-export all MQTT types from shared-types
export {
  type BoomTelemetry,
  type CabinTelemetry,
  type DashboardOCR,
  type FusedTelemetry,
  type BoomCameraInference,
  type CabinCameraInference,
  type AlertMessage,
  type LiftStateUpdate,
  type OperatorStateUpdate,
  type EngineStateUpdate,
  type CalibrationUpdate,
  type CommandMessage,
  type DiagnosticMessage,
  MQTT_TOPICS,
  buildTopic,
} from '@mosy/shared-types';

// Zod validators
export {
  BoomTelemetrySchema,
  CabinTelemetrySchema,
  DashboardOCRSchema,
  FusedTelemetrySchema,
  AlertMessageSchema,
  LiftStateUpdateSchema,
  OperatorStateUpdateSchema,
  EngineStateUpdateSchema,
  CalibrationUpdateSchema,
  CommandMessageSchema,
  DiagnosticMessageSchema,
  validateMqttMessage,
} from './validators';
