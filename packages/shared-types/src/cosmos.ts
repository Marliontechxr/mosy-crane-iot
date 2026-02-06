// =============================================================================
// MOSY Cosmos DB Document Types — Blueprint Section 15
// Database: mosydb
// =============================================================================

import type { AlertLevel, AlertSource, TelemetryStatus } from './mqtt';

// ---------------------------------------------------------------------------
// Container: telemetry — partition key: /craneId — TTL: 90 days
// ---------------------------------------------------------------------------
export interface TelemetryDocument {
  id: string;
  craneId: string;
  siteId: string;
  timestamp: number;
  sequence: number;
  load: {
    value_tonnes: number;
    max_safe_tonnes: number;
    percent: number;
    confidence: number;
    source: 'ocr';
  };
  position: {
    boom_angle_degrees: number;
    boom_distance_m: number;
    hook_height_m: number;
    confidence: number;
  };
  motion: {
    acceleration_x: number;
    acceleration_y: number;
    acceleration_z: number;
    angular_velocity_x: number;
    angular_velocity_y: number;
    angular_velocity_z: number;
  };
  environment: {
    wind_speed_kmh: number;
    temperature_c: number;
    hazard_zone_motion: boolean;
  };
  safety_flags: {
    load_over_limit: boolean;
    wind_excessive: boolean;
    operator_present: boolean;
    operator_drowsy: boolean;
    uncommanded_motion: boolean;
  };
  status: TelemetryStatus;
  ttl: number;
}

// ---------------------------------------------------------------------------
// Container: alerts — partition key: /craneId — TTL: none
// ---------------------------------------------------------------------------
export interface AlertDocument {
  id: string;
  craneId: string;
  siteId: string;
  alertId: string;
  timestamp: number;
  level: AlertLevel;
  type: string;
  title: string;
  description: string;
  source: AlertSource;
  values: Record<string, unknown>;
  acknowledged: boolean;
  acknowledged_at?: number;
  acknowledged_by?: string;
  actions: string[];
  auto_recovery: boolean;
  created_at: number;
}

// ---------------------------------------------------------------------------
// Container: shifts — partition key: /operatorId — TTL: none
// ---------------------------------------------------------------------------
export interface ShiftDocument {
  id: string;
  operatorId: string;
  siteId: string;
  craneId: string;
  shift_start: number;
  shift_end: number;
  shift_duration_minutes: number;
  status: 'in_progress' | 'completed' | 'abandoned';
  lifts: {
    count: number;
    total_tonnage: number;
    avg_load_tonnage: number;
    max_load_tonnage: number;
  };
  performance: {
    score: number;
    safety_incidents: number;
    near_misses: number;
    fatigue_incidents: number;
  };
  operator: {
    name: string;
    id: string;
    employee_id: string;
  };
  environmental: {
    avg_wind_speed_kmh: number;
    max_wind_speed_kmh: number;
    temperature_range: [number, number];
  };
  notes: string;
  created_at: number;
}

// ---------------------------------------------------------------------------
// Container: lifts — partition key: /craneId — TTL: 1 year
// ---------------------------------------------------------------------------
export interface LiftDocument {
  id: string;
  craneId: string;
  siteId: string;
  lift_number: number;
  lift_start: number;
  lift_end: number;
  duration_seconds: number;
  status: 'completed' | 'aborted' | 'partial';
  load: {
    weight_tonnes: number;
    max_safe_tonnes: number;
    percent_of_max: number;
    material_type?: string;
  };
  operator: {
    id: string;
    name: string;
    perclos_avg: number;
    fatigue_incidents: number;
  };
  boom: {
    angle_start: number;
    angle_end: number;
    max_angle: number;
    distance_m: number;
  };
  safety: {
    load_limit_exceeded: boolean;
    wind_hazard: boolean;
    operator_fatigue_detected: boolean;
    anomalies: string[];
  };
  shift_id: string;
  created_at: number;
}

// ---------------------------------------------------------------------------
// Container: cranes — partition key: /siteId — TTL: none
// ---------------------------------------------------------------------------
export type CraneType = 'mobile' | 'tower' | 'overhead';
export type CraneStatus = 'active' | 'maintenance' | 'retired';

export interface CraneDocument {
  id: string;
  siteId: string;
  crane_id: string;
  name: string;
  crane_type: CraneType;
  max_load_tonnes: number;
  boom_length_m: number;
  location: {
    site_name: string;
    latitude: number;
    longitude: number;
  };
  hardware: {
    jetson_device_id: string;
    rpi5_device_id: string;
    esp32_device_ids: string[];
  };
  sensors: {
    lidar_model: string;
    imu_model: string;
    camera_count: number;
  };
  status: CraneStatus;
  last_calibration: number;
  created_at: number;
}

// ---------------------------------------------------------------------------
// Container: operators — partition key: /siteId — TTL: none
// ---------------------------------------------------------------------------
export type OperatorStatus = 'active' | 'inactive' | 'suspended';

export interface OperatorDocument {
  id: string;
  siteId: string;
  operator_id: string;
  name: string;
  email: string;
  phone: string;
  employee_id: string;
  department: string;
  certifications: {
    mobile_crane: boolean;
    tower_crane: boolean;
    overhead_crane: boolean;
    expires: number;
  };
  performance_metrics: {
    total_lifts: number;
    total_tonnage: number;
    safety_score: number;
    avg_lift_duration_minutes: number;
  };
  status: OperatorStatus;
  hire_date: number;
  created_at: number;
}

// ---------------------------------------------------------------------------
// Container: sites — partition key: /organizationId — TTL: none
// ---------------------------------------------------------------------------
export interface SiteDocument {
  id: string;
  organizationId: string;
  site_id: string;
  name: string;
  location: {
    address: string;
    city: string;
    state: string;
    latitude: number;
    longitude: number;
  };
  crane_ids: string[];
  manager_ids: string[];
  status: 'active' | 'inactive';
  created_at: number;
}

// ---------------------------------------------------------------------------
// Container: calibrations — partition key: /craneId — TTL: none
// ---------------------------------------------------------------------------
export interface CalibrationDocument {
  id: string;
  craneId: string;
  siteId: string;
  calibration_id: string;
  effective_from: number;
  created_at: number;
  approved_by: string;
  version: number;
  gauges: Record<
    string,
    {
      type: 'digital' | 'analog';
      roi: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      scale_min: number;
      scale_max: number;
      unit: string;
      decimal_places: number;
      ocr_engine: string;
    }
  >;
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
// Container: diagnostics — partition key: /craneId — TTL: 30 days
// ---------------------------------------------------------------------------
export interface DiagnosticsDocument {
  id: string;
  craneId: string;
  siteId: string;
  component: string;
  status: 'healthy' | 'degraded' | 'error' | 'offline';
  timestamp: number;
  uptime_seconds: number;
  metrics: Record<string, number | string>;
  error_code?: string;
  error_message?: string;
  ttl: number;
}

// ---------------------------------------------------------------------------
// Container: incidents — partition key: /siteId — TTL: none
// ---------------------------------------------------------------------------
export interface IncidentDocument {
  id: string;
  siteId: string;
  craneId: string;
  incident_id: string;
  timestamp: number;
  type: 'safety_violation' | 'equipment_failure' | 'near_miss' | 'accident';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  alert_ids: string[];
  operator_id?: string;
  resolution: string;
  resolved_at?: number;
  resolved_by?: string;
  attachments: string[];
  created_at: number;
}

// ---------------------------------------------------------------------------
// Cosmos DB Container Metadata
// ---------------------------------------------------------------------------
export const COSMOS_CONTAINERS = {
  TELEMETRY: { name: 'telemetry', partitionKey: '/craneId', ttlDays: 90 },
  ALERTS: { name: 'alerts', partitionKey: '/craneId', ttlDays: null },
  SHIFTS: { name: 'shifts', partitionKey: '/operatorId', ttlDays: null },
  LIFTS: { name: 'lifts', partitionKey: '/craneId', ttlDays: 365 },
  CRANES: { name: 'cranes', partitionKey: '/siteId', ttlDays: null },
  OPERATORS: { name: 'operators', partitionKey: '/siteId', ttlDays: null },
  SITES: { name: 'sites', partitionKey: '/organizationId', ttlDays: null },
  CALIBRATIONS: { name: 'calibrations', partitionKey: '/craneId', ttlDays: null },
  DIAGNOSTICS: { name: 'diagnostics', partitionKey: '/craneId', ttlDays: 30 },
  INCIDENTS: { name: 'incidents', partitionKey: '/siteId', ttlDays: null },
} as const;

export const COSMOS_DATABASE = 'mosydb';
