// =============================================================================
// @mosy/shared-types — Public API
// =============================================================================

// MQTT Message Types (Blueprint Section 9)
export type {
  LidarReading,
  ImuReading,
  RadarReading,
  BoomTelemetry,
  AnemometerReading,
  CabinCameraStatus,
  EnvironmentalReading,
  CabinTelemetry,
  GaugeReading,
  OcrQualityMetrics,
  DashboardOCR,
  FusedLoad,
  FusedPosition,
  FusedMotion,
  FusedEnvironment,
  SafetyFlags,
  FusedTelemetry,
  BoundingBox,
  Detection,
  BoomCameraInference,
  OperatorVisionState,
  CabinEnvironmental,
  CabinCameraInference,
  AlertMessage,
  LiftStateUpdate,
  OperatorStateUpdate,
  EngineStateUpdate,
  GaugeCalibration,
  SensorOffsets,
  SafetyLimits,
  CalibrationUpdate,
  CommandMessage,
  DiagnosticMessage,
} from './mqtt';

export {
  type TelemetryStatus,
  type AlertLevel,
  type AlertSource,
  type LiftState,
  type OperatorPresenceState,
  type EngineState,
  type CommandTarget,
  type ComponentHealth,
  MQTT_TOPICS,
  buildTopic,
} from './mqtt';

// Cosmos DB Document Types (Blueprint Section 15)
export type {
  TelemetryDocument,
  AlertDocument,
  ShiftDocument,
  LiftDocument,
  CraneDocument,
  OperatorDocument,
  SiteDocument,
  CalibrationDocument,
  DiagnosticsDocument,
  IncidentDocument,
} from './cosmos';

export {
  type CraneType,
  type CraneStatus,
  type OperatorStatus,
  COSMOS_CONTAINERS,
  COSMOS_DATABASE,
} from './cosmos';

// API Request/Response Types (Blueprint Section 16)
export type {
  FleetCraneSummary,
  FleetResponse,
  CraneDetailResponse,
  TelemetryQueryParams,
  TelemetryPoint,
  TelemetryHistoryResponse,
  CalibrationRequest,
  CalibrationResponse,
  OperatorListItem,
  OperatorsResponse,
  ShiftSummary,
  OperatorShiftsResponse,
  AlertQueryParams,
  AlertListItem,
  AlertsResponse,
  AcknowledgeRequest,
  AcknowledgeResponse,
  ShiftReportResponse,
  SignalRNegotiateResponse,
  TelemetryUpdateEvent,
  AlertNotificationEvent,
  StateChangeEvent,
  SignalREvent,
  ApiErrorResponse,
} from './api';

export { type UserRole, type ApiErrorCode, ROLE_IDS } from './api';

// Control-Plane Types
export type {
  CreateCraneRequest,
  UpdateCraneRequest,
  CraneListItem,
  CreateOperatorRequest,
  UpdateOperatorRequest,
  OperatorDetailResponse,
  CalibrationProfileResponse,
  ShiftReportListItem,
  ShiftReportsResponse,
  SafetyComplianceResponse,
  ProductivityReportResponse,
  SensorDiagnostic,
  CraneDiagnosticsResponse,
  SiteListItem,
  CreateSiteRequest,
  UpdateSiteRequest,
  EnrollmentRequest,
  EnrollmentResponse,
  OperatorCheckInMessage,
} from './api';
