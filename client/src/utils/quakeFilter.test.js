import { describe, it, expect } from 'vitest';
import {
  buildFilterParams,
  defaultFilterParams,
  validateFilterFields,
  dayStartIso,
  dayEndIso,
  isoToUsDate,
  usDateToIso
} from './quakeFilter.js';
import { EQ_MIN_MAGNITUDE, EQ_QUERY_LIMIT } from '../config.js';

const base = { fromDate: '2026-01-01', toDate: '2026-02-01', magMin: '', magMax: '', depthMin: '', depthMax: '' };

describe('validateFilterFields', () => {
  it('accepts a consistent set of ranges', () => {
    expect(validateFilterFields(base)).toBeNull();
  });

  it('rejects a reversed date range', () => {
    expect(validateFilterFields({ ...base, fromDate: '2026-02-01', toDate: '2026-01-01' })).toBe(
      'Start date must be on or before the end date.'
    );
  });

  it('rejects a reversed magnitude range', () => {
    expect(validateFilterFields({ ...base, magMin: '6', magMax: '4' })).toBe(
      'Minimum magnitude must not exceed maximum magnitude.'
    );
  });

  it('rejects a reversed depth range', () => {
    expect(validateFilterFields({ ...base, depthMin: '100', depthMax: '10' })).toBe(
      'Minimum depth must not exceed maximum depth.'
    );
  });
});

describe('buildFilterParams', () => {
  it('defaults min magnitude and limit, formats dates to UTC bounds', () => {
    const params = buildFilterParams(base);
    expect(params.min_mag).toBe(EQ_MIN_MAGNITUDE);
    expect(params.limit).toBe(EQ_QUERY_LIMIT);
    expect(params.from).toBe(dayStartIso('2026-01-01'));
    expect(params.to).toBe(dayEndIso('2026-02-01'));
  });

  it('omits max magnitude and depth bounds when the fields are empty', () => {
    const params = buildFilterParams(base);
    expect(params.max_mag).toBeUndefined();
    expect(params.min_depth).toBeUndefined();
    expect(params.max_depth).toBeUndefined();
  });

  it('includes magnitude and depth bounds when set', () => {
    const params = buildFilterParams({ ...base, magMin: '3.5', magMax: '6', depthMin: '10', depthMax: '100' });
    expect(params.min_mag).toBe(3.5);
    expect(params.max_mag).toBe(6);
    expect(params.min_depth).toBe(10);
    expect(params.max_depth).toBe(100);
  });
});

describe('isoToUsDate', () => {
  it('formats ISO to MM/DD/YYYY', () => {
    expect(isoToUsDate('2026-10-07')).toBe('10/07/2026');
  });

  it('returns empty string for empty or malformed input', () => {
    expect(isoToUsDate('')).toBe('');
    expect(isoToUsDate(null)).toBe('');
    expect(isoToUsDate('10/07/2026')).toBe('');
  });
});

describe('usDateToIso', () => {
  it('parses MM/DD/YYYY and single-digit M/D/YYYY', () => {
    expect(usDateToIso('10/07/2026')).toBe('2026-10-07');
    expect(usDateToIso('1/5/2026')).toBe('2026-01-05');
  });

  it('round-trips with isoToUsDate', () => {
    expect(usDateToIso(isoToUsDate('2026-02-28'))).toBe('2026-02-28');
  });

  it('returns empty string for incomplete, out-of-range, or impossible dates', () => {
    expect(usDateToIso('10/')).toBe('');
    expect(usDateToIso('13/01/2026')).toBe('');
    expect(usDateToIso('02/31/2026')).toBe('');
    expect(usDateToIso('')).toBe('');
  });
});

describe('defaultFilterParams', () => {
  it('applies the default magnitude floor and a bounded window', () => {
    const params = defaultFilterParams();
    expect(params.min_mag).toBe(EQ_MIN_MAGNITUDE);
    expect(params.limit).toBe(EQ_QUERY_LIMIT);
    expect(typeof params.from).toBe('string');
    expect(typeof params.to).toBe('string');
  });
});
