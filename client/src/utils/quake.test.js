import { describe, it, expect } from 'vitest';
import {
  magnitudeColor,
  magnitudeRadius,
  magnitudeCircleColorExpression,
  magnitudeCircleRadiusExpression,
  normalizeLon,
  normalizeCoordinates,
  normalizeQuake,
  normalizeQuakeCollection,
  quakesToFeatureCollection
} from './quake.js';

describe('magnitudeColor', () => {
  it('matches the fixed magnitude scale (4.0 or less is green)', () => {
    expect(magnitudeColor(1)).toBe('#82b183');
    expect(magnitudeColor(2.9)).toBe('#82b183');
    expect(magnitudeColor(3.0)).toBe('#82b183');
    expect(magnitudeColor(4.0)).toBe('#82b183');
    expect(magnitudeColor(4.1)).toBe('#3fbdd1');
    expect(magnitudeColor(5.0)).toBe('#3fbdd1');
    expect(magnitudeColor(5.1)).toBe('#e8a020');
    expect(magnitudeColor(6.0)).toBe('#e8a020');
    expect(magnitudeColor(6.1)).toBe('#a12f2f');
    expect(magnitudeColor(9)).toBe('#a12f2f');
  });

  it('treats null and undefined magnitude as unknown (gray), never as zero', () => {
    expect(magnitudeColor(null)).toBe('#9aa4b2');
    expect(magnitudeColor(undefined)).toBe('#9aa4b2');
    expect(magnitudeColor(NaN)).toBe('#9aa4b2');
  });
});

describe('magnitudeRadius', () => {
  it('grows with magnitude and has a sane floor', () => {
    expect(magnitudeRadius(1)).toBeGreaterThanOrEqual(3);
    expect(magnitudeRadius(8)).toBeGreaterThan(magnitudeRadius(2));
    expect(magnitudeRadius(null)).toBe(4);
  });
});

describe('magnitudeCircleColorExpression', () => {
  it('is case(null -> gray, else step) mirroring magnitudeColor tiers', () => {
    const [op, nullCheck, gray, step] = magnitudeCircleColorExpression;
    expect(op).toBe('case');
    expect(nullCheck).toEqual(['==', ['get', 'magnitude'], null]);
    expect(gray).toBe(magnitudeColor(null));
    const [stepOp, , base, ...stops] = step;
    expect(stepOp).toBe('step');
    expect(base).toBe(magnitudeColor(1)); // 4.0 or less -> green
    const pairs = [];
    for (let i = 0; i < stops.length; i += 2) pairs.push([stops[i], stops[i + 1]]);
    expect(pairs).toEqual([
      [4.1, magnitudeColor(4.1)],
      [5.1, magnitudeColor(5.1)],
      [6.1, magnitudeColor(6.1)]
    ]);
  });
});

describe('magnitudeCircleRadiusExpression', () => {
  it('falls back to 4 for null magnitude, same as magnitudeRadius(null)', () => {
    const [op, , fallback] = magnitudeCircleRadiusExpression;
    expect(op).toBe('case');
    expect(fallback).toBe(magnitudeRadius(null));
  });
});

describe('normalizeLon', () => {
  it('leaves -180..180 values untouched', () => {
    expect(normalizeLon(0)).toBe(0);
    expect(normalizeLon(-170)).toBe(-170);
    expect(normalizeLon(179)).toBe(179);
  });

  it('wraps 0..360 style longitudes across the antimeridian', () => {
    expect(normalizeLon(190)).toBe(-170);
    expect(normalizeLon(360)).toBe(0);
    expect(normalizeLon(-190)).toBe(170);
  });
});

describe('normalizeCoordinates', () => {
  it('keeps GeoJSON [lon, lat] order (Mapbox native, no swap)', () => {
    expect(normalizeCoordinates([139.7, 35.7])).toEqual([139.7, 35.7]);
  });

  it('normalizes longitude past the antimeridian during conversion', () => {
    expect(normalizeCoordinates([200, 10])).toEqual([-160, 10]);
  });

  it('returns null for malformed coordinates', () => {
    expect(normalizeCoordinates(null)).toBeNull();
    expect(normalizeCoordinates([1])).toBeNull();
    expect(normalizeCoordinates(['a', 'b'])).toBeNull();
    expect(normalizeCoordinates([NaN, 1])).toBeNull();
  });
});

describe('normalizeQuake', () => {
  it('extracts fields from a GeoJSON Feature', () => {
    const feature = {
      id: 1,
      geometry: { type: 'Point', coordinates: [-122.4, 37.8] },
      properties: {
        source: 'usgs',
        source_id: 'us1000abcd',
        magnitude: 5.2,
        depth_km: 10.5,
        occurred_at: '2026-08-13T10:00:00Z',
        place: 'Northern California'
      }
    };
    expect(normalizeQuake(feature)).toEqual({
      id: 1,
      sourceId: 'us1000abcd',
      source: 'usgs',
      place: 'Northern California',
      magnitude: 5.2,
      depthKm: 10.5,
      occurredAt: '2026-08-13T10:00:00Z',
      coordinates: [-122.4, 37.8]
    });
  });

  it('keeps null magnitude and depth as null, never zero-fills', () => {
    const feature = {
      geometry: { type: 'Point', coordinates: [10, 20] },
      properties: { source_id: 'x1', magnitude: null, depth_km: null }
    };
    const result = normalizeQuake(feature);
    expect(result.magnitude).toBeNull();
    expect(result.depthKm).toBeNull();
  });

  it('returns null when coordinates are missing', () => {
    expect(normalizeQuake({ properties: {} })).toBeNull();
  });

  it('returns null for falsy input', () => {
    expect(normalizeQuake(null)).toBeNull();
    expect(normalizeQuake(undefined)).toBeNull();
  });

  it('normalizes a quake crossing the antimeridian', () => {
    const feature = {
      geometry: { type: 'Point', coordinates: [185, -12] },
      properties: { source_id: 'am1', magnitude: 5 }
    };
    expect(normalizeQuake(feature).coordinates).toEqual([-175, -12]);
  });
});

describe('normalizeQuakeCollection', () => {
  it('handles a GeoJSON FeatureCollection', () => {
    const collection = {
      type: 'FeatureCollection',
      features: [
        { geometry: { coordinates: [1, 2] }, properties: { source_id: 'a' } },
        { geometry: { coordinates: [3, 4] }, properties: { source_id: 'b' } }
      ]
    };
    expect(normalizeQuakeCollection(collection)).toHaveLength(2);
  });

  it('handles a plain array response', () => {
    const list = [{ geometry: { coordinates: [1, 2] }, properties: { source_id: 'a' } }];
    expect(normalizeQuakeCollection(list)).toHaveLength(1);
  });

  it('returns an empty array for an empty or malformed payload', () => {
    expect(normalizeQuakeCollection(null)).toEqual([]);
    expect(normalizeQuakeCollection({})).toEqual([]);
    expect(normalizeQuakeCollection([])).toEqual([]);
  });

  it('drops individual features with malformed geometry instead of throwing', () => {
    const list = [
      { geometry: { coordinates: [1, 2] }, properties: { source_id: 'ok' } },
      { geometry: null, properties: { source_id: 'bad' } }
    ];
    expect(normalizeQuakeCollection(list)).toHaveLength(1);
  });
});

describe('quakesToFeatureCollection', () => {
  it('builds a GeoJSON FeatureCollection with [lon, lat] point geometry', () => {
    const quakes = normalizeQuakeCollection([
      {
        geometry: { coordinates: [10, 20] },
        properties: { source_id: 'a', magnitude: 5.1, depth_km: 12 }
      }
    ]);
    const fc = quakesToFeatureCollection(quakes);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [10, 20] });
    expect(fc.features[0].properties.magnitude).toBe(5.1);
  });

  it('returns an empty FeatureCollection for empty input', () => {
    expect(quakesToFeatureCollection([])).toEqual({ type: 'FeatureCollection', features: [] });
    expect(quakesToFeatureCollection(undefined)).toEqual({
      type: 'FeatureCollection',
      features: []
    });
  });
});
