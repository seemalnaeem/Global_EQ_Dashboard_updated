import { describe, it, expect } from 'vitest';
import {
  getBoundaryAttributeConfig,
  humanizeFieldLabel,
  formatAttributeValue,
  findShortCode,
  buildFeatureCard,
  HIDDEN_FIELDS
} from './attributeConfig.js';

describe('getBoundaryAttributeConfig', () => {
  it('returns config for each of the four boundary layers', () => {
    expect(getBoundaryAttributeConfig('national_boundary')).toBeTruthy();
    expect(getBoundaryAttributeConfig('provincial_boundary')).toBeTruthy();
    expect(getBoundaryAttributeConfig('district_boundary')).toBeTruthy();
    expect(getBoundaryAttributeConfig('tehsil_boundary')).toBeTruthy();
  });

  it('returns config for fault lines (clickable for the fault name)', () => {
    expect(getBoundaryAttributeConfig('fault_lines')).toBeTruthy();
  });

  it('returns null for an unconfigured layer, never throws', () => {
    expect(getBoundaryAttributeConfig('tectonic_boundaries')).toBeNull();
    expect(getBoundaryAttributeConfig('unknown_layer')).toBeNull();
  });
});

describe('humanizeFieldLabel', () => {
  it('applies known overrides', () => {
    expect(humanizeFieldLabel('division')).toBe('Division');
    expect(humanizeFieldLabel('province')).toBe('Province');
    expect(humanizeFieldLabel('country')).toBe('Country');
    expect(humanizeFieldLabel('area_sq_km')).toBe('Area');
  });

  it('title-cases an unconfigured snake_case key as a fallback', () => {
    expect(humanizeFieldLabel('some_other_field')).toBe('Some Other Field');
  });
});

describe('formatAttributeValue', () => {
  it('formats population with thousands separators', () => {
    expect(formatAttributeValue('population', 1234567)).toBe('1,234,567');
  });

  it('formats area_sq_km with one decimal and a km2 unit', () => {
    expect(formatAttributeValue('area_sq_km', 42.567)).toBe('42.6 km2');
  });

  it('stringifies other fields as-is', () => {
    expect(formatAttributeValue('province', 'Sindh')).toBe('Sindh');
  });

  it('returns null for null, undefined, or empty string, never fabricates a value', () => {
    expect(formatAttributeValue('population', null)).toBeNull();
    expect(formatAttributeValue('population', undefined)).toBeNull();
    expect(formatAttributeValue('province', '')).toBeNull();
  });
});

describe('findShortCode', () => {
  it('finds a common code-like field when present', () => {
    expect(findShortCode({ iso_code: 'PK' })).toBe('PK');
  });

  it('returns null when no candidate code field is present, never invents one', () => {
    expect(findShortCode({ province: 'Sindh' })).toBeNull();
    expect(findShortCode(null)).toBeNull();
  });
});

describe('buildFeatureCard', () => {
  it('builds a card for district_boundary with real fields, skipping missing ones', () => {
    const card = buildFeatureCard('district_boundary', {
      ogc_fid: 12,
      districts: 'Larkana',
      province: 'Sindh',
      division: 'Larkana',
      country: 'Pakistan'
      // population intentionally absent
    });
    expect(card.title).toBe('Larkana');
    expect(card.subtitle).toBe('Sindh');
    expect(card.rows.map((r) => r.key)).toEqual(['division', 'country']);
    expect(card.rows.find((r) => r.key === 'division').label).toBe('Division');
  });

  it('formats tehsil_boundary area_sq_km and skips a null field', () => {
    const card = buildFeatureCard('tehsil_boundary', {
      tehsil: 'Ratodero',
      district: 'Larkana',
      province: 'Sindh',
      area_sq_km: 512.34
    });
    expect(card.rows).toEqual([
      { key: 'province', label: 'Province', value: 'Sindh' },
      { key: 'area_sq_km', label: 'Area', value: '512.3 km2' }
    ]);
  });

  it('falls back to "Unnamed feature" when the name field is missing, never fabricates a name', () => {
    const card = buildFeatureCard('national_boundary', {});
    expect(card.title).toBe('Unnamed feature');
    expect(card.subtitle).toBeNull();
    expect(card.rows).toEqual([]);
  });

  it('returns null for a layer with no attribute config', () => {
    expect(buildFeatureCard('tectonic_boundaries', { name: 'Ridge' })).toBeNull();
  });

  it('builds a fault line card from name, slip type, and catalog', () => {
    const card = buildFeatureCard('fault_lines', {
      name: 'San Andreas',
      slip_type: 'Dextral',
      catalog_na: 'UCERF3'
    });
    expect(card.title).toBe('San Andreas');
    expect(card.subtitle).toBe('Dextral');
    expect(card.rows).toEqual([{ key: 'catalog_na', label: 'Catalog', value: 'UCERF3' }]);
  });

  it('returns null when properties are missing', () => {
    expect(buildFeatureCard('national_boundary', null)).toBeNull();
  });

  it('never surfaces a hidden technical field even if it were misconfigured in', () => {
    expect(HIDDEN_FIELDS.has('ogc_fid')).toBe(true);
    expect(HIDDEN_FIELDS.has('shape_area')).toBe(true);
  });
});
