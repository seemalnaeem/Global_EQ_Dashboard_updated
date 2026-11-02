import { describe, it, expect } from 'vitest';
import {
  buildTileUrl,
  defaultRasterControls,
  COLORMAPS,
  COLORMAP_RAMPS,
  colormapRampCss
} from './rasterTiles.js';

const PGA_ENTRY = {
  name: 'pga_hazard',
  title: 'Peak Ground Acceleration',
  cog_path: '/data/cogs/pga_hazard.tif',
  tiles_endpoint: '/tiles/cog/tiles/{z}/{x}/{y}.png',
  min: 0,
  max: 1.2,
  colormap_default: 'magma',
  categorical: false
};

describe('buildTileUrl', () => {
  it('builds a TiTiler URL with url, colormap_name and rescale params', () => {
    const url = buildTileUrl(PGA_ENTRY, { colormap: 'viridis', rescaleMin: 0, rescaleMax: 1.2 });
    expect(url).toBe(
      '/tiles/cog/tiles/{z}/{x}/{y}.png?url=/data/cogs/pga_hazard.tif&colormap_name=viridis&rescale=0,1.2'
    );
  });

  it('falls back to the entry colormap_default and min/max when options are omitted', () => {
    const url = buildTileUrl(PGA_ENTRY);
    expect(url).toBe(
      '/tiles/cog/tiles/{z}/{x}/{y}.png?url=/data/cogs/pga_hazard.tif&colormap_name=magma&rescale=0,1.2'
    );
  });

  it('rebuilds with a new colormap and rescale without touching cog_path', () => {
    const a = buildTileUrl(PGA_ENTRY, { colormap: 'turbo', rescaleMin: 0.1, rescaleMax: 0.9 });
    const b = buildTileUrl(PGA_ENTRY, { colormap: 'greys', rescaleMin: 0.1, rescaleMax: 0.9 });
    expect(a).toContain('colormap_name=turbo');
    expect(b).toContain('colormap_name=greys');
    expect(a).toContain('url=/data/cogs/pga_hazard.tif');
    expect(b).toContain('url=/data/cogs/pga_hazard.tif');
  });

  it('returns null when the entry is missing required fields', () => {
    expect(buildTileUrl(null)).toBeNull();
    expect(buildTileUrl({})).toBeNull();
    expect(buildTileUrl({ tiles_endpoint: '/tiles/cog/tiles/{z}/{x}/{y}.png' })).toBeNull();
  });
});

describe('defaultRasterControls', () => {
  it('seeds rescale from entry min/max and colormap from colormap_default', () => {
    expect(defaultRasterControls(PGA_ENTRY)).toEqual({
      visible: false,
      opacity: 0.8,
      colormap: 'magma',
      rescaleMin: 0,
      rescaleMax: 1.2
    });
  });

  it('falls back to viridis and 0..1 when the entry has no stats yet', () => {
    expect(defaultRasterControls({})).toEqual({
      visible: false,
      opacity: 0.8,
      colormap: 'viridis',
      rescaleMin: 0,
      rescaleMax: 1
    });
  });
});

describe('COLORMAPS', () => {
  it('offers the curated colormap set including viridis and turbo', () => {
    expect(COLORMAPS).toContain('viridis');
    expect(COLORMAPS).toContain('turbo');
    expect(COLORMAPS.length).toBeGreaterThanOrEqual(6);
  });
});

describe('colormapRampCss', () => {
  it('has a valid linear-gradient entry for every curated colormap', () => {
    COLORMAPS.forEach((name) => {
      const css = colormapRampCss(name);
      expect(COLORMAP_RAMPS[name]).toBe(css);
      expect(css).toMatch(/^linear-gradient\(to right, .+\)$/);
    });
  });

  it('falls back to a neutral gradient for an unknown colormap name', () => {
    const css = colormapRampCss('not-a-real-colormap');
    expect(css).toMatch(/^linear-gradient\(to right, .+\)$/);
    expect(COLORMAP_RAMPS['not-a-real-colormap']).toBeUndefined();
  });
});
