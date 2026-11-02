import { describe, it, expect } from 'vitest';
import { formatUtc, formatNumber } from './format.js';

describe('formatUtc', () => {
  it('formats a UTC ISO timestamp for display', () => {
    const result = formatUtc('2026-08-13T10:00:00Z');
    expect(result).toContain('2026');
    expect(result).not.toBe('unknown time');
  });

  it('returns a fallback for missing or invalid timestamps, never throws', () => {
    expect(formatUtc(null)).toBe('unknown time');
    expect(formatUtc(undefined)).toBe('unknown time');
    expect(formatUtc('')).toBe('unknown time');
    expect(formatUtc('not-a-date')).toBe('unknown time');
  });
});

describe('formatNumber', () => {
  it('appends the unit for real values', () => {
    expect(formatNumber(10.5, ' km')).toBe('10.5 km');
    expect(formatNumber(0, '')).toBe('0'); // 0 is a real depth, not missing
  });

  it('shows unknown for null or undefined, never zero-fills', () => {
    expect(formatNumber(null, ' km')).toBe('unknown');
    expect(formatNumber(undefined, ' km')).toBe('unknown');
  });
});
