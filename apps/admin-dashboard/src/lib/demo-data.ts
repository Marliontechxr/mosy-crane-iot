/**
 * MOSY — Demo Mode Static Data
 *
 * Returns realistic data for every API endpoint when NEXT_PUBLIC_DEMO_MODE=true.
 * Uses exact TypeScript types from @mosy/shared-types.
 */

import type {
  FleetResponse,
  CraneDetailResponse,
  OperatorListItem,
  AlertListItem,
  ShiftSummary,
  TelemetryHistoryResponse,
  TelemetryPoint,
  AcknowledgeResponse,
} from '@mosy/shared-types';

/** Check if demo mode is enabled. */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}

/** Demo fleet: 3 cranes in different states. */
export function getDemoFleet(): FleetResponse {
  return {
    total_cranes: 3,
    online_count: 2,
    offline_count: 1,
    critical_alerts: 1,
    cranes: [
      {
        id: 'DEMO-001',
        name: 'Liebherr LTM 1300',
        status: 'active',
        current_load_tonnes: 39.0,
        load_percent: 78,
        operator_present: true,
        last_telemetry_ms_ago: 1200,
        alert_level: 'warning',
      },
      {
        id: 'DEMO-002',
        name: 'Tadano GR-800XL',
        status: 'idle',
        current_load_tonnes: 0,
        load_percent: 0,
        operator_present: false,
        last_telemetry_ms_ago: 45000,
        alert_level: 'info',
      },
      {
        id: 'DEMO-003',
        name: 'XCMG QY70K-I',
        status: 'active',
        current_load_tonnes: 16.1,
        load_percent: 46,
        operator_present: true,
        last_telemetry_ms_ago: 800,
        alert_level: 'warning',
      },
    ],
  };
}

/** Demo crane detail. */
export function getDemoCraneDetail(id: string): CraneDetailResponse {
  const cranes: Record<string, CraneDetailResponse> = {
    'DEMO-001': {
      id: 'DEMO-001',
      name: 'Liebherr LTM 1300',
      type: 'mobile',
      max_load: 50,
      status: 'active',
      location: { site: 'Chennai Port Construction', latitude: 13.0827, longitude: 80.2707 },
      current_telemetry: {
        timestamp: Date.now(),
        load_tonnes: 39.0,
        boom_angle: 52.3,
        wind_speed_kmh: 18.5,
        operator_perclos: 0.08,
      },
      last_calibration: Date.now() - 86400000 * 3,
      firmware: { jetson_version: '1.0.0-rc1', mqtt_client: '1.6.1' },
    },
    'DEMO-002': {
      id: 'DEMO-002',
      name: 'Tadano GR-800XL',
      type: 'mobile',
      max_load: 80,
      status: 'idle',
      location: { site: 'Chennai Port Construction', latitude: 13.0832, longitude: 80.2712 },
      current_telemetry: {
        timestamp: Date.now() - 45000,
        load_tonnes: 0,
        boom_angle: 0,
        wind_speed_kmh: 16.2,
        operator_perclos: 0,
      },
      last_calibration: Date.now() - 86400000 * 10,
      firmware: { jetson_version: '1.0.0-rc1', mqtt_client: '1.6.1' },
    },
    'DEMO-003': {
      id: 'DEMO-003',
      name: 'XCMG QY70K-I',
      type: 'mobile',
      max_load: 70,
      status: 'active',
      location: { site: 'Chennai Port Construction', latitude: 13.0822, longitude: 80.2702 },
      current_telemetry: {
        timestamp: Date.now(),
        load_tonnes: 16.1,
        boom_angle: 38.7,
        wind_speed_kmh: 22.8,
        operator_perclos: 0.06,
      },
      last_calibration: Date.now() - 86400000 * 5,
      firmware: { jetson_version: '1.0.0-rc1', mqtt_client: '1.6.1' },
    },
  };
  return cranes[id] ?? cranes['DEMO-001'];
}

/** Demo operators: 5 with scores 72-96. */
export function getDemoOperators(): OperatorListItem[] {
  const now = Date.now();
  return [
    {
      id: 'OP-001',
      name: 'Rajesh Kumar',
      email: 'rajesh.kumar@balanetra.com',
      certifications: { mobile_crane: true, expires: now + 86400000 * 180 },
      performance_metrics: { total_lifts: 1247, safety_score: 96 },
      status: 'active',
    },
    {
      id: 'OP-002',
      name: 'Suresh Patel',
      email: 'suresh.patel@balanetra.com',
      certifications: { mobile_crane: true, expires: now + 86400000 * 90 },
      performance_metrics: { total_lifts: 892, safety_score: 88 },
      status: 'active',
    },
    {
      id: 'OP-003',
      name: 'Vikram Singh',
      email: 'vikram.singh@balanetra.com',
      certifications: { mobile_crane: true, expires: now + 86400000 * 45 },
      performance_metrics: { total_lifts: 634, safety_score: 82 },
      status: 'active',
    },
    {
      id: 'OP-004',
      name: 'Arun Sharma',
      email: 'arun.sharma@balanetra.com',
      certifications: { mobile_crane: true, expires: now + 86400000 * 200 },
      performance_metrics: { total_lifts: 1583, safety_score: 91 },
      status: 'off-duty',
    },
    {
      id: 'OP-005',
      name: 'Deepak Rao',
      email: 'deepak.rao@balanetra.com',
      certifications: { mobile_crane: false, expires: now - 86400000 * 15 },
      performance_metrics: { total_lifts: 312, safety_score: 72 },
      status: 'inactive',
    },
  ];
}

/** Demo alerts: 15 sample alerts, mix of levels, some acknowledged. */
export function getDemoAlerts(): AlertListItem[] {
  const now = Date.now();
  return [
    {
      id: 'ALERT-D01', crane_id: 'DEMO-001', timestamp: now - 120000,
      level: 'critical', title: 'Load at 92% — exceeding safe threshold',
      description: 'Current load 46.0t on DEMO-001 exceeds 90% of max rated capacity 50t',
      acknowledged: false, acknowledgement_required: true,
    },
    {
      id: 'ALERT-D02', crane_id: 'DEMO-003', timestamp: now - 300000,
      level: 'warning', title: 'Wind speed 23 km/h — approaching limit',
      description: 'Wind gusts detected near operational limit of 25 km/h for current load',
      acknowledged: false, acknowledgement_required: true,
    },
    {
      id: 'ALERT-D03', crane_id: 'DEMO-001', timestamp: now - 600000,
      level: 'warning', title: 'Load at 78% — monitor closely',
      description: 'Load increasing steadily, approaching warning threshold',
      acknowledged: true, acknowledgement_required: true,
    },
    {
      id: 'ALERT-D04', crane_id: 'DEMO-001', timestamp: now - 900000,
      level: 'info', title: 'Operator Rajesh Kumar checked in',
      description: 'Shift started on DEMO-001 at Chennai Port Construction',
      acknowledged: true, acknowledgement_required: false,
    },
    {
      id: 'ALERT-D05', crane_id: 'DEMO-003', timestamp: now - 1200000,
      level: 'warning', title: 'Operator drowsiness detected (PERCLOS 18%)',
      description: 'PERCLOS score rising — recommend break within 30 minutes',
      acknowledged: false, acknowledgement_required: true,
    },
    {
      id: 'ALERT-D06', crane_id: 'DEMO-001', timestamp: now - 1800000,
      level: 'info', title: 'Daily calibration check passed',
      description: 'All 5 dashboard gauges within tolerance (±2%)',
      acknowledged: true, acknowledgement_required: false,
    },
    {
      id: 'ALERT-D07', crane_id: 'DEMO-002', timestamp: now - 2400000,
      level: 'info', title: 'Crane DEMO-002 entered idle mode',
      description: 'No operator detected for 10 minutes, engine running at idle',
      acknowledged: true, acknowledgement_required: false,
    },
    {
      id: 'ALERT-D08', crane_id: 'DEMO-001', timestamp: now - 3600000,
      level: 'critical', title: 'Emergency stop triggered',
      description: 'Load exceeded 95% capacity — automatic motion inhibit activated',
      acknowledged: true, acknowledgement_required: true,
    },
    {
      id: 'ALERT-D09', crane_id: 'DEMO-003', timestamp: now - 4200000,
      level: 'warning', title: 'Ground clearance below 3m',
      description: 'Hook height 2.8m — risk of contact with ground obstacles',
      acknowledged: true, acknowledgement_required: true,
    },
    {
      id: 'ALERT-D10', crane_id: 'DEMO-001', timestamp: now - 5400000,
      level: 'info', title: 'Lift cycle completed (#47)',
      description: 'Steel beam delivery: 18.2t lifted to pier section B3',
      acknowledged: true, acknowledgement_required: false,
    },
    {
      id: 'ALERT-D11', crane_id: 'DEMO-003', timestamp: now - 7200000,
      level: 'warning', title: 'OCR confidence drop (62%)',
      description: 'Dashboard camera view partially obstructed, readings may be inaccurate',
      acknowledged: true, acknowledgement_required: true,
    },
    {
      id: 'ALERT-D12', crane_id: 'DEMO-002', timestamp: now - 9000000,
      level: 'info', title: 'Operator Suresh Patel checked out',
      description: 'Shift ended — 14 lifts, 186t total, safety score 91',
      acknowledged: true, acknowledgement_required: false,
    },
    {
      id: 'ALERT-D13', crane_id: 'DEMO-001', timestamp: now - 10800000,
      level: 'critical', title: 'Radius exceeded for current load',
      description: 'Boom at 58° with 35t load exceeds rated capacity at this radius',
      acknowledged: true, acknowledgement_required: true,
    },
    {
      id: 'ALERT-D14', crane_id: 'DEMO-003', timestamp: now - 14400000,
      level: 'info', title: 'Firmware update available (v1.0.1)',
      description: 'New version includes improved sensor fusion algorithm',
      acknowledged: false, acknowledgement_required: false,
    },
    {
      id: 'ALERT-D15', crane_id: 'DEMO-001', timestamp: now - 18000000,
      level: 'warning', title: 'Engine temperature elevated (82°C)',
      description: 'Coolant temperature above normal range, monitor for overheating',
      acknowledged: true, acknowledgement_required: true,
    },
  ];
}

/** Demo shift history: 30 days for a given operator. */
export function getDemoShifts(operatorId: string): ShiftSummary[] {
  const now = Date.now();
  const cranes = ['DEMO-001', 'DEMO-002', 'DEMO-003'];

  return Array.from({ length: 30 }, (_, i) => {
    const dayOffset = (i + 1) * 86400000;
    const isWeekend = new Date(now - dayOffset).getDay() % 6 === 0;
    const lifts = isWeekend ? 0 : 10 + Math.floor(Math.random() * 12);
    const tonnage = lifts * (14 + Math.random() * 8);

    return {
      id: `SHIFT-${operatorId}-${i + 1}`,
      shift_start: now - dayOffset,
      shift_end: now - dayOffset + (isWeekend ? 0 : 28800000),
      duration_minutes: isWeekend ? 0 : 480,
      crane_id: cranes[i % cranes.length],
      lifts: { count: lifts, total_tonnage: Math.round(tonnage * 10) / 10 },
      performance: {
        score: isWeekend ? 0 : 78 + Math.floor(Math.random() * 20),
        safety_incidents: i === 5 || i === 18 ? 1 : 0,
      },
    };
  });
}

/** Demo telemetry history: generates realistic time-series points. */
export function getDemoTelemetry(craneId: string, limit: number = 60): TelemetryHistoryResponse {
  const now = Date.now();
  const points: TelemetryPoint[] = Array.from({ length: limit }, (_, i) => {
    const t = i / limit;
    return {
      timestamp: now - (limit - i) * 1000,
      load_tonnes: 15 + 20 * Math.sin(t * Math.PI * 4) * Math.max(0, Math.sin(t * Math.PI * 2)),
      boom_angle: 42 + 8 * Math.sin(t * Math.PI * 3),
      boom_distance_m: 18 + 4 * Math.sin(t * Math.PI * 2),
      wind_speed_kmh: 14 + 6 * Math.sin(t * Math.PI * 1.5) + Math.random() * 2,
      operator_perclos: 0.04 + 0.06 * Math.abs(Math.sin(t * Math.PI * 5)),
      status: 'valid',
    };
  });

  return { crane_id: craneId, points, count: points.length };
}

/** Demo acknowledge response. */
export function getDemoAcknowledge(): AcknowledgeResponse {
  return { success: true, acknowledged_at: Date.now() };
}
