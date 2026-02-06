/**
 * Tests for utility functions — cn, formatters, color helpers.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  cn,
  formatTimestamp,
  formatRelativeTime,
  formatTonnes,
  formatPercent,
  getAlertColor,
  getCraneStatusColor,
} from './utils';

describe('cn (className merge)', () => {
  it('merges class names', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2');
  });

  it('handles conditional classes', () => {
    expect(cn('text-white', false && 'bg-red-500', 'font-bold')).toBe('text-white font-bold');
  });

  it('resolves Tailwind conflicts', () => {
    // twMerge should resolve conflicting padding values
    const result = cn('px-4', 'px-8');
    expect(result).toBe('px-8');
  });

  it('handles empty input', () => {
    expect(cn()).toBe('');
  });
});

describe('formatTimestamp', () => {
  it('returns a date string for valid timestamp', () => {
    const ts = new Date('2026-01-15T10:30:00Z').getTime();
    const result = formatTimestamp(ts);
    // Locale-dependent, but should contain numeric parts
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(5);
  });
});

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns seconds for < 60s', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(formatRelativeTime(now - 30000)).toBe('30s ago');
  });

  it('returns minutes for < 60m', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(formatRelativeTime(now - 300000)).toBe('5m ago');
  });

  it('returns hours for < 24h', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(formatRelativeTime(now - 7200000)).toBe('2h ago');
  });

  it('returns days for >= 24h', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(formatRelativeTime(now - 172800000)).toBe('2d ago');
  });
});

describe('formatTonnes', () => {
  it('formats with one decimal place', () => {
    expect(formatTonnes(12.567)).toBe('12.6t');
    expect(formatTonnes(0)).toBe('0.0t');
    expect(formatTonnes(100)).toBe('100.0t');
  });
});

describe('formatPercent', () => {
  it('rounds to nearest integer', () => {
    expect(formatPercent(42.7)).toBe('43%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(100)).toBe('100%');
  });
});

describe('getAlertColor', () => {
  it('returns red for critical', () => {
    expect(getAlertColor('critical')).toBe('text-red-500');
  });

  it('returns amber for warning', () => {
    expect(getAlertColor('warning')).toBe('text-amber-500');
  });

  it('returns blue for info', () => {
    expect(getAlertColor('info')).toBe('text-blue-500');
  });

  it('returns slate for unknown', () => {
    expect(getAlertColor('unknown')).toBe('text-slate-400');
  });
});

describe('getCraneStatusColor', () => {
  it('returns gray for offline regardless of load', () => {
    expect(getCraneStatusColor('offline', 90)).toBe('bg-gray-500');
  });

  it('returns red when load >= 90%', () => {
    expect(getCraneStatusColor('active', 90)).toBe('bg-red-500');
    expect(getCraneStatusColor('active', 100)).toBe('bg-red-500');
  });

  it('returns amber when load 75-89%', () => {
    expect(getCraneStatusColor('active', 75)).toBe('bg-amber-500');
    expect(getCraneStatusColor('active', 89)).toBe('bg-amber-500');
  });

  it('returns green when load < 75%', () => {
    expect(getCraneStatusColor('active', 0)).toBe('bg-green-500');
    expect(getCraneStatusColor('active', 74)).toBe('bg-green-500');
  });
});
