/**
 * Tests for HUD calculation utilities.
 */
import { describe, it, expect } from 'vitest';
import {
  getLoadZone,
  getLoadColor,
  computeLoadPercent,
  getWindZone,
  getWindColor,
  getClearanceZone,
  getClearanceColor,
  formatClearance,
  formatWindSpeed,
  computeGaugeAngle,
  describeArc,
} from '../hud-calculations';

// --- Load Zone ---
describe('getLoadZone', () => {
  it('returns normal for 0%', () => {
    expect(getLoadZone(0)).toBe('normal');
  });

  it('returns normal for 79%', () => {
    expect(getLoadZone(79)).toBe('normal');
  });

  it('returns warning for 80%', () => {
    expect(getLoadZone(80)).toBe('warning');
  });

  it('returns warning for 99%', () => {
    expect(getLoadZone(99)).toBe('warning');
  });

  it('returns overload for 100%', () => {
    expect(getLoadZone(100)).toBe('overload');
  });

  it('returns overload for 150%', () => {
    expect(getLoadZone(150)).toBe('overload');
  });
});

describe('getLoadColor', () => {
  it('returns green for normal', () => {
    expect(getLoadColor('normal')).toBe('#22C55E');
  });

  it('returns amber for warning', () => {
    expect(getLoadColor('warning')).toBe('#F59E0B');
  });

  it('returns red for overload', () => {
    expect(getLoadColor('overload')).toBe('#EF4444');
  });
});

describe('computeLoadPercent', () => {
  it('computes correct percentage', () => {
    expect(computeLoadPercent(25, 50)).toBe(50);
  });

  it('returns 100% at rated capacity', () => {
    expect(computeLoadPercent(50, 50)).toBe(100);
  });

  it('clamps at 0 for negative load', () => {
    expect(computeLoadPercent(-10, 50)).toBe(0);
  });

  it('clamps at 150 for extreme overload', () => {
    expect(computeLoadPercent(100, 50)).toBe(150);
  });

  it('returns 0 for zero rated capacity', () => {
    expect(computeLoadPercent(25, 0)).toBe(0);
  });

  it('returns 0 for negative rated capacity', () => {
    expect(computeLoadPercent(25, -10)).toBe(0);
  });
});

// --- Wind Zone ---
describe('getWindZone', () => {
  it('returns calm for 0 km/h', () => {
    expect(getWindZone(0)).toBe('calm');
  });

  it('returns calm for 29 km/h', () => {
    expect(getWindZone(29)).toBe('calm');
  });

  it('returns moderate for 30 km/h', () => {
    expect(getWindZone(30)).toBe('moderate');
  });

  it('returns moderate for 49 km/h', () => {
    expect(getWindZone(49)).toBe('moderate');
  });

  it('returns high for 50 km/h', () => {
    expect(getWindZone(50)).toBe('high');
  });

  it('returns high for 71 km/h', () => {
    expect(getWindZone(71)).toBe('high');
  });

  it('returns dangerous for 72 km/h', () => {
    expect(getWindZone(72)).toBe('dangerous');
  });

  it('returns dangerous for 100 km/h', () => {
    expect(getWindZone(100)).toBe('dangerous');
  });
});

describe('getWindColor', () => {
  it('returns green for calm', () => {
    expect(getWindColor('calm')).toBe('#22C55E');
  });

  it('returns amber for moderate', () => {
    expect(getWindColor('moderate')).toBe('#F59E0B');
  });

  it('returns orange for high', () => {
    expect(getWindColor('high')).toBe('#F97316');
  });

  it('returns red for dangerous', () => {
    expect(getWindColor('dangerous')).toBe('#EF4444');
  });
});

// --- Clearance Zone ---
describe('getClearanceZone', () => {
  it('returns danger for 0m', () => {
    expect(getClearanceZone(0)).toBe('danger');
  });

  it('returns danger for 0.9m', () => {
    expect(getClearanceZone(0.9)).toBe('danger');
  });

  it('returns caution for 1m', () => {
    expect(getClearanceZone(1)).toBe('caution');
  });

  it('returns caution for 3m', () => {
    expect(getClearanceZone(3)).toBe('caution');
  });

  it('returns safe for 3.1m', () => {
    expect(getClearanceZone(3.1)).toBe('safe');
  });

  it('returns safe for 10m', () => {
    expect(getClearanceZone(10)).toBe('safe');
  });
});

describe('getClearanceColor', () => {
  it('returns green for safe', () => {
    expect(getClearanceColor('safe')).toBe('#22C55E');
  });

  it('returns amber for caution', () => {
    expect(getClearanceColor('caution')).toBe('#F59E0B');
  });

  it('returns red for danger', () => {
    expect(getClearanceColor('danger')).toBe('#EF4444');
  });
});

// --- Formatters ---
describe('formatClearance', () => {
  it('shows 1 decimal for values under 10m', () => {
    expect(formatClearance(5.7)).toBe('5.7m');
  });

  it('shows 1 decimal for values near 0', () => {
    expect(formatClearance(0.3)).toBe('0.3m');
  });

  it('rounds for values 10m+', () => {
    expect(formatClearance(15.4)).toBe('15m');
  });

  it('rounds for exactly 10m', () => {
    expect(formatClearance(10)).toBe('10m');
  });
});

describe('formatWindSpeed', () => {
  it('rounds to integer', () => {
    expect(formatWindSpeed(25.7)).toBe('26 km/h');
  });

  it('handles zero', () => {
    expect(formatWindSpeed(0)).toBe('0 km/h');
  });
});

// --- Gauge Angle ---
describe('computeGaugeAngle', () => {
  it('returns 0 for 0%', () => {
    expect(computeGaugeAngle(0)).toBe(0);
  });

  it('returns 135 for 50%', () => {
    expect(computeGaugeAngle(50)).toBe(135);
  });

  it('returns 270 for 100%', () => {
    expect(computeGaugeAngle(100)).toBe(270);
  });

  it('clamps at 150% (405 → capped at 270 * 1.5)', () => {
    // 150% → (150/100) * 270 = 405, but input is clamped to 150%
    expect(computeGaugeAngle(200)).toBe(computeGaugeAngle(150));
  });

  it('clamps negative to 0', () => {
    expect(computeGaugeAngle(-10)).toBe(0);
  });
});

// --- SVG Arc ---
describe('describeArc', () => {
  it('returns an SVG path string starting with M', () => {
    const path = describeArc(50, 50, 40, 0, 90);
    expect(path).toMatch(/^M /);
  });

  it('contains an A (arc) command', () => {
    const path = describeArc(50, 50, 40, 0, 90);
    expect(path).toContain(' A ');
  });

  it('sets large arc flag for angles > 180', () => {
    const path = describeArc(50, 50, 40, 0, 200);
    // large arc flag should be 1
    expect(path).toMatch(/A 40 40 0 1 1/);
  });

  it('clears large arc flag for angles <= 180', () => {
    const path = describeArc(50, 50, 40, 0, 90);
    expect(path).toMatch(/A 40 40 0 0 1/);
  });
});
