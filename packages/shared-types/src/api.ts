// =============================================================================
// MOSY API Request/Response Types — Blueprint Section 16
// All routes: /api/...
// =============================================================================

import type { AlertLevel } from './mqtt';

// ---------------------------------------------------------------------------
// GET /api/fleet
// ---------------------------------------------------------------------------
export interface FleetCraneSummary {
  id: string;
  name: string;
  status: string;
  current_load_tonnes: number;
  load_percent: number;
  operator_present: boolean;
  last_telemetry_ms_ago: number;
  alert_level: string;
}

export interface FleetResponse {
  total_cranes: number;
  online_count: number;
  offline_count: number;
  critical_alerts: number;
  cranes: FleetCraneSummary[];
}

// ---------------------------------------------------------------------------
// GET /api/crane/{id}
// ---------------------------------------------------------------------------
export interface CraneDetailResponse {
  id: string;
  name: string;
  type: string;
  max_load: number;
  status: string;
  location: {
    site: string;
    latitude: number;
    longitude: number;
  };
  current_telemetry: {
    timestamp: number;
    load_tonnes: number;
    boom_angle: number;
    wind_speed_kmh: number;
    operator_perclos: number;
  };
  last_calibration: number;
  firmware: {
    jetson_version: string;
    mqtt_client: string;
  };
}

// ---------------------------------------------------------------------------
// GET /api/crane/{id}/telemetry?from=&to=&limit=
// ---------------------------------------------------------------------------
export interface TelemetryQueryParams {
  from?: string;
  to?: string;
  limit?: number;
}

export interface TelemetryPoint {
  timestamp: number;
  load_tonnes: number;
  boom_angle: number;
  boom_distance_m: number;
  wind_speed_kmh: number;
  operator_perclos: number;
  status: string;
}

export interface TelemetryHistoryResponse {
  crane_id: string;
  points: TelemetryPoint[];
  count: number;
}

// ---------------------------------------------------------------------------
// PUT /api/crane/{id}/calibration
// ---------------------------------------------------------------------------
export interface CalibrationRequest {
  calibration_id: string;
  effective_from: number;
  gauges: Record<
    string,
    {
      type: 'digital' | 'analog';
      roi: { x: number; y: number; width: number; height: number };
      scale_min: number;
      scale_max: number;
      unit: string;
    }
  >;
}

export interface CalibrationResponse {
  success: boolean;
  calibration_id: string;
  effective_from: number;
}

// ---------------------------------------------------------------------------
// GET /api/operators
// ---------------------------------------------------------------------------
export interface OperatorListItem {
  id: string;
  name: string;
  email: string;
  certifications: {
    mobile_crane: boolean;
    expires: number;
  };
  performance_metrics: {
    total_lifts: number;
    safety_score: number;
  };
  status: string;
}

export type OperatorsResponse = OperatorListItem[];

// ---------------------------------------------------------------------------
// GET /api/operators/{id}/shifts
// ---------------------------------------------------------------------------
export interface ShiftSummary {
  id: string;
  shift_start: number;
  shift_end: number;
  duration_minutes: number;
  crane_id: string;
  lifts: {
    count: number;
    total_tonnage: number;
  };
  performance: {
    score: number;
    safety_incidents: number;
  };
}

export type OperatorShiftsResponse = ShiftSummary[];

// ---------------------------------------------------------------------------
// GET /api/alerts?level=&crane=&acknowledged=&from=&to=
// ---------------------------------------------------------------------------
export interface AlertQueryParams {
  level?: AlertLevel;
  crane?: string;
  acknowledged?: boolean;
  from?: string;
  to?: string;
}

export interface AlertListItem {
  id: string;
  crane_id: string;
  timestamp: number;
  level: AlertLevel;
  title: string;
  description: string;
  acknowledged: boolean;
  acknowledgement_required: boolean;
}

export type AlertsResponse = AlertListItem[];

// ---------------------------------------------------------------------------
// POST /api/alerts/{id}/acknowledge
// ---------------------------------------------------------------------------
export interface AcknowledgeRequest {
  acknowledged_by: string;
  notes: string;
}

export interface AcknowledgeResponse {
  success: boolean;
  acknowledged_at: number;
}

// ---------------------------------------------------------------------------
// GET /api/reports/shift/{id}
// ---------------------------------------------------------------------------
export interface ShiftReportResponse {
  id: string;
  operator: string;
  crane: string;
  shift_duration: string;
  summary: {
    lifts: number;
    tonnage: number;
    avg_load_percent: number;
  };
  safety: {
    critical_alerts: number;
    warnings: number;
    incidents: number;
  };
  pdf_url: string;
}

// ---------------------------------------------------------------------------
// GET /api/signalr/negotiate
// ---------------------------------------------------------------------------
export interface SignalRNegotiateResponse {
  url: string;
  accessToken: string;
}

// ---------------------------------------------------------------------------
// SignalR Event Types (Server → Client)
// ---------------------------------------------------------------------------
export interface TelemetryUpdateEvent {
  type: 'telemetryUpdate';
  craneId: string;
  timestamp: number;
  data: {
    load_tonnes: number;
    boom_angle: number;
    wind_speed_kmh: number;
    operator_perclos: number;
  };
}

export interface AlertNotificationEvent {
  type: 'alertNotification';
  craneId: string;
  alertId: string;
  level: AlertLevel;
  title: string;
  timestamp: number;
}

export interface StateChangeEvent {
  type: 'stateChange';
  craneId: string;
  stateType: string;
  previousState: string;
  currentState: string;
  timestamp: number;
}

export type SignalREvent = TelemetryUpdateEvent | AlertNotificationEvent | StateChangeEvent;

// ---------------------------------------------------------------------------
// Common API Error Response
// ---------------------------------------------------------------------------
export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: string;
  };
}

// ---------------------------------------------------------------------------
// RBAC Roles
// ---------------------------------------------------------------------------
export type UserRole = 'SuperAdmin' | 'SiteManager' | 'Operator' | 'Viewer';

export const ROLE_IDS: Record<UserRole, string> = {
  SuperAdmin: '00000000-0000-0000-0000-000000000001',
  SiteManager: '00000000-0000-0000-0000-000000000002',
  Operator: '00000000-0000-0000-0000-000000000003',
  Viewer: '00000000-0000-0000-0000-000000000004',
};

// =============================================================================
// Control-Plane Types — Crane, Operator, Site, Calibration, Reports, Diagnostics
// =============================================================================

// ---------------------------------------------------------------------------
// POST /api/cranes
// ---------------------------------------------------------------------------
export interface CreateCraneRequest {
  name: string;
  crane_type: 'mobile' | 'tower' | 'overhead';
  model: string;
  serial_number: string;
  max_load_tonnes: number;
  boom_length_m: number;
  site_id: string;
}

// ---------------------------------------------------------------------------
// PUT /api/cranes/{id}
// ---------------------------------------------------------------------------
export interface UpdateCraneRequest extends Partial<CreateCraneRequest> {
  status?: 'active' | 'maintenance' | 'retired';
}

// ---------------------------------------------------------------------------
// GET /api/cranes
// ---------------------------------------------------------------------------
export interface CraneListItem {
  id: string;
  name: string;
  crane_type: 'mobile' | 'tower' | 'overhead';
  model: string;
  serial_number: string;
  max_load_tonnes: number;
  boom_length_m: number;
  site_name: string;
  status: 'active' | 'maintenance' | 'retired';
  last_calibration: number;
}

// ---------------------------------------------------------------------------
// POST /api/operators
// ---------------------------------------------------------------------------
export interface CreateOperatorRequest {
  name: string;
  email: string;
  phone: string;
  employee_id: string;
  department: string;
  site_id: string;
  certifications: {
    mobile_crane: boolean;
    tower_crane: boolean;
    overhead_crane: boolean;
    expires: number;
  };
}

// ---------------------------------------------------------------------------
// PUT /api/operators/{id}
// ---------------------------------------------------------------------------
export interface UpdateOperatorRequest extends Partial<CreateOperatorRequest> {
  status?: 'active' | 'inactive' | 'suspended';
}

// ---------------------------------------------------------------------------
// GET /api/operators/{id} — Extended detail
// ---------------------------------------------------------------------------
export interface OperatorDetailResponse extends OperatorListItem {
  phone: string;
  employee_id: string;
  department: string;
  certifications: {
    mobile_crane: boolean;
    tower_crane: boolean;
    overhead_crane: boolean;
    expires: number;
  };
  enrollment_status: 'enrolled' | 'not_enrolled' | 'pending';
  hire_date: number;
}

// ---------------------------------------------------------------------------
// GET /api/cranes/{id}/calibration
// ---------------------------------------------------------------------------
export interface CalibrationProfileResponse {
  crane_id: string;
  calibration_id: string;
  effective_from: number;
  version: number;
  gauges: Record<string, {
    type: 'digital' | 'analog';
    roi: { x: number; y: number; width: number; height: number };
    scale_min: number;
    scale_max: number;
    unit: string;
    decimal_places: number;
    ocr_engine: string;
  }>;
  sensor_offsets: {
    lidar_offset_mm: number;
    imu_gyro_bias: [number, number, number];
  };
  safety_limits: {
    max_load_tonnes: number;
    max_boom_angle_degrees: number;
    max_wind_kmh: number;
  };
}

// ---------------------------------------------------------------------------
// GET /api/reports/shifts
// ---------------------------------------------------------------------------
export interface ShiftReportListItem {
  id: string;
  shift_start: number;
  shift_end: number;
  duration_minutes: number;
  operator_name: string;
  operator_id: string;
  crane_name: string;
  crane_id: string;
  lifts_count: number;
  total_tonnage: number;
  performance_score: number;
  safety_incidents: number;
  pdf_url: string | null;
}

export type ShiftReportsResponse = ShiftReportListItem[];

// ---------------------------------------------------------------------------
// GET /api/reports/safety
// ---------------------------------------------------------------------------
export interface SafetyComplianceResponse {
  total_shifts: number;
  safe_shifts: number;
  compliance_percent: number;
  avg_resolution_time_minutes: number;
  alert_distribution: {
    level: 'info' | 'warning' | 'critical';
    count: number;
  }[];
  top_alert_types: {
    type: string;
    count: number;
  }[];
}

// ---------------------------------------------------------------------------
// GET /api/reports/productivity
// ---------------------------------------------------------------------------
export interface ProductivityReportResponse {
  daily_lifts: {
    date: string;
    crane_id: string;
    crane_name: string;
    lifts: number;
    tonnage: number;
  }[];
  summary: {
    total_lifts: number;
    total_tonnage: number;
    avg_lifts_per_day: number;
    avg_tonnage_per_day: number;
  };
}

// ---------------------------------------------------------------------------
// GET /api/cranes/{id}/diagnostics
// ---------------------------------------------------------------------------
export interface SensorDiagnostic {
  sensor: string;
  status: 'healthy' | 'degraded' | 'error' | 'offline';
  last_reading: number;
  metrics: Record<string, number | string>;
  error_message?: string;
}

export interface CraneDiagnosticsResponse {
  crane_id: string;
  crane_name: string;
  overall_status: 'healthy' | 'degraded' | 'error';
  sensors: SensorDiagnostic[];
  last_updated: number;
}

// ---------------------------------------------------------------------------
// GET/POST/PUT /api/sites
// ---------------------------------------------------------------------------
export interface SiteListItem {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  crane_count: number;
  manager_names: string[];
  status: 'active' | 'inactive';
}

export interface CreateSiteRequest {
  name: string;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}

export interface UpdateSiteRequest extends Partial<CreateSiteRequest> {
  status?: 'active' | 'inactive';
}

// ---------------------------------------------------------------------------
// POST /api/operators/{id}/enroll
// ---------------------------------------------------------------------------
export interface EnrollmentRequest {
  image_data: string;
}

export interface EnrollmentResponse {
  success: boolean;
  enrollment_status: 'enrolled' | 'pending' | 'failed';
  message: string;
}

// ---------------------------------------------------------------------------
// Tablet Check-in MQTT Message
// ---------------------------------------------------------------------------
export interface OperatorCheckInMessage {
  timestamp: number;
  crane_id: string;
  operator_id: string;
  operator_name: string;
  action: 'check-in' | 'check-out';
}
