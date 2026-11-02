import { describe, it, expect } from 'vitest';
import {
  vectorLayerRenderType,
  vectorLayerPaint,
  vectorLayerIconKind,
  vectorLayerLabel,
  vectorLayerGeometryKind,
  vectorLayerMapLayerIds,
  defaultLayerStyle,
  layerStyleToPaint,
  buildLayerOrder,
  mergeLayerOrder,
  PRESET_COLORS,
  BOUNDARY_LAYER_NAMES,
  TECTONIC_LAYER_NAMES,
  buildVectorTileUrl
} from './vectorLayers.js';

describe('vectorLayerRenderType', () => {
  it('renders tectonic_points as circles', () => {
    expect(vectorLayerRenderType('tectonic_points')).toBe('circle');
  });

  it('renders fault_lines and tectonic_boundaries as lines', () => {
    expect(vectorLayerRenderType('fault_lines')).toBe('line');
    expect(vectorLayerRenderType('tectonic_boundaries')).toBe('line');
  });

  it('defaults unknown layer names to line, never throws', () => {
    expect(vectorLayerRenderType('some_future_layer')).toBe('line');
  });
});

describe('vectorLayerPaint', () => {
  it('gives each known layer a distinct color', () => {
    const fault = vectorLayerPaint('fault_lines');
    const boundary = vectorLayerPaint('tectonic_boundaries');
    expect(fault['line-color']).not.toBe(boundary['line-color']);
  });

  it('gives circle layers a circle-radius paint prop', () => {
    expect(vectorLayerPaint('tectonic_points')).toHaveProperty('circle-radius');
  });
});

describe('vectorLayerIconKind', () => {
  it('marks circle layers as point icons', () => {
    expect(vectorLayerIconKind('tectonic_points')).toBe('point');
  });

  it('marks administrative boundary layers as admin icons', () => {
    expect(vectorLayerIconKind('national_boundary')).toBe('admin');
    expect(vectorLayerIconKind('provincial_boundary')).toBe('admin');
    expect(vectorLayerIconKind('district_boundary')).toBe('admin');
    expect(vectorLayerIconKind('tehsil_boundary')).toBe('admin');
  });

  it('marks fault lines and tectonic plate boundaries as line icons, not admin', () => {
    expect(vectorLayerIconKind('fault_lines')).toBe('line');
    expect(vectorLayerIconKind('tectonic_boundaries')).toBe('line');
  });

  it('defaults an unknown layer name to line', () => {
    expect(vectorLayerIconKind('some_future_layer')).toBe('line');
  });
});

describe('buildVectorTileUrl', () => {
  it('builds an origin-anchored XYZ pbf url template scoped to the layer name', () => {
    expect(buildVectorTileUrl('fault_lines')).toBe(
      `${window.location.origin}/api/tiles/fault_lines/{z}/{x}/{y}.pbf`
    );
  });

  it('anchors to the current page origin, not a hardcoded host, so it follows the browser IP', () => {
    const url = buildVectorTileUrl('tectonic_points');
    expect(url.startsWith(window.location.origin)).toBe(true);
    expect(url.endsWith('/api/tiles/tectonic_points/{z}/{x}/{y}.pbf')).toBe(true);
  });
});

describe('vectorLayerLabel', () => {
  it('gives every known layer a human label', () => {
    expect(vectorLayerLabel('national_boundary')).toBe('National');
    expect(vectorLayerLabel('provincial_boundary')).toBe('Provincial');
    expect(vectorLayerLabel('district_boundary')).toBe('Districts');
    expect(vectorLayerLabel('tehsil_boundary')).toBe('Tehsils');
    expect(vectorLayerLabel('fault_lines')).toBe('Fault lines');
    expect(vectorLayerLabel('tectonic_boundaries')).toBe('Plate boundaries');
    expect(vectorLayerLabel('tectonic_points')).toBe('Plate points');
  });

  it('falls back to the raw name for an unknown layer, never throws', () => {
    expect(vectorLayerLabel('some_future_layer')).toBe('some_future_layer');
  });
});

describe('vectorLayerGeometryKind', () => {
  it('marks admin boundaries as polygons', () => {
    BOUNDARY_LAYER_NAMES.forEach((name) => {
      expect(vectorLayerGeometryKind(name)).toBe('polygon');
    });
  });

  it('marks tectonic_points as a point and the tectonic lines as lines', () => {
    expect(vectorLayerGeometryKind('tectonic_points')).toBe('point');
    expect(vectorLayerGeometryKind('fault_lines')).toBe('line');
    expect(vectorLayerGeometryKind('tectonic_boundaries')).toBe('line');
  });

  it('defaults an unknown layer to line', () => {
    expect(vectorLayerGeometryKind('some_future_layer')).toBe('line');
  });
});

describe('vectorLayerMapLayerIds', () => {
  it('gives a polygon layer both a fill and a line id, fill first (drawn under)', () => {
    expect(vectorLayerMapLayerIds('national_boundary')).toEqual([
      'vector-fill-national_boundary',
      'vector-line-national_boundary'
    ]);
  });

  it('gives a plain line layer a single line id', () => {
    expect(vectorLayerMapLayerIds('tectonic_boundaries')).toEqual([
      'vector-line-tectonic_boundaries'
    ]);
  });

  it('gives an arrow line layer (fault lines) a line id under an arrow id', () => {
    expect(vectorLayerMapLayerIds('fault_lines')).toEqual([
      'vector-line-fault_lines',
      'vector-linearrow-fault_lines'
    ]);
  });

  it('gives a point layer a single circle id', () => {
    expect(vectorLayerMapLayerIds('tectonic_points')).toEqual(['vector-circle-tectonic_points']);
  });
});

describe('defaultLayerStyle', () => {
  it('gives admin boundaries a low default fill opacity so nested levels stay readable', () => {
    BOUNDARY_LAYER_NAMES.forEach((name) => {
      expect(defaultLayerStyle(name).fillOpacity).toBeGreaterThan(0);
      expect(defaultLayerStyle(name).fillOpacity).toBeLessThanOrEqual(0.1);
    });
  });

  it('keeps the current line colors as defaults for fault_lines/tectonic_boundaries', () => {
    expect(defaultLayerStyle('fault_lines').color).toBe(vectorLayerPaint('fault_lines')['line-color']);
    expect(defaultLayerStyle('tectonic_boundaries').color).toBe(
      vectorLayerPaint('tectonic_boundaries')['line-color']
    );
  });

  it('gives admin boundaries distinct default colors from one another', () => {
    const colors = BOUNDARY_LAYER_NAMES.map((name) => defaultLayerStyle(name).color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('returns a fresh object every call, so callers cannot mutate a shared default', () => {
    const a = defaultLayerStyle('fault_lines');
    a.color = '#000000';
    expect(defaultLayerStyle('fault_lines').color).not.toBe('#000000');
  });

  it('never throws for an unknown layer name', () => {
    expect(defaultLayerStyle('some_future_layer')).toEqual({
      color: '#8b949e',
      outlineWidth: 1,
      fillOpacity: 0.1
    });
  });
});

describe('layerStyleToPaint', () => {
  const style = { color: '#123456', outlineWidth: 2, fillOpacity: 0.3 };

  it('gives a polygon layer a fill paint under a line paint', () => {
    const paint = layerStyleToPaint('district_boundary', style);
    expect(paint.fillPaint).toEqual({ 'fill-color': '#123456', 'fill-opacity': 0.3 });
    expect(paint.linePaint).toEqual({ 'line-color': '#123456', 'line-width': 2 });
    expect(paint.circlePaint).toBeUndefined();
  });

  it('gives a line layer only a line paint', () => {
    const paint = layerStyleToPaint('fault_lines', style);
    expect(paint.linePaint).toEqual({ 'line-color': '#123456', 'line-width': 2 });
    expect(paint.fillPaint).toBeUndefined();
  });

  it('gives a point layer a circle paint with the layer color', () => {
    const paint = layerStyleToPaint('tectonic_points', style);
    expect(paint.circlePaint['circle-color']).toBe('#123456');
    expect(paint.circlePaint['circle-radius']).toBeGreaterThan(0);
    expect(paint.fillPaint).toBeUndefined();
    expect(paint.linePaint).toBeUndefined();
  });

  it('falls back to a sane default when the style is missing fields', () => {
    const paint = layerStyleToPaint('fault_lines', {});
    expect(paint.linePaint['line-color']).toBe('#8b949e');
    expect(paint.linePaint['line-width']).toBe(1);
  });
});

describe('buildLayerOrder / mergeLayerOrder', () => {
  it('orders a fresh catalog with tectonics ahead of admin boundaries', () => {
    const names = [...BOUNDARY_LAYER_NAMES, ...TECTONIC_LAYER_NAMES];
    const order = buildLayerOrder(names);
    expect(order).toHaveLength(names.length);
    const lastTectonicIdx = Math.max(...TECTONIC_LAYER_NAMES.map((n) => order.indexOf(n)));
    const firstBoundaryIdx = Math.min(...BOUNDARY_LAYER_NAMES.map((n) => order.indexOf(n)));
    expect(lastTectonicIdx).toBeLessThan(firstBoundaryIdx);
  });

  it('appends an unknown future layer name at the end, never drops it', () => {
    const order = buildLayerOrder(['fault_lines', 'some_future_layer']);
    expect(order).toEqual(['fault_lines', 'some_future_layer']);
  });

  it('mergeLayerOrder preserves a previously reordered sequence for known names', () => {
    const prev = ['tehsil_boundary', 'national_boundary', 'fault_lines'];
    const merged = mergeLayerOrder(prev, ['tehsil_boundary', 'national_boundary', 'fault_lines']);
    expect(merged).toEqual(prev);
  });

  it('mergeLayerOrder appends a newly seen catalog name without disturbing prior order', () => {
    const prev = ['tehsil_boundary', 'fault_lines'];
    const merged = mergeLayerOrder(prev, ['tehsil_boundary', 'fault_lines', 'tectonic_points']);
    expect(merged).toEqual(['tehsil_boundary', 'fault_lines', 'tectonic_points']);
  });
});

describe('PRESET_COLORS', () => {
  it('offers a sober palette of 12-16 preset colors', () => {
    expect(PRESET_COLORS.length).toBeGreaterThanOrEqual(12);
    expect(PRESET_COLORS.length).toBeLessThanOrEqual(16);
    PRESET_COLORS.forEach((color) => expect(color).toMatch(/^#[0-9a-f]{6}$/i));
  });
});
