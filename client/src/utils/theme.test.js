import { describe, it, expect } from 'vitest';
import { resolveInitialTheme, toggleThemeValue, mapStyleForTheme } from './theme.js';

describe('resolveInitialTheme', () => {
  it('prefers an explicit stored theme over the OS preference', () => {
    expect(resolveInitialTheme('light', false)).toBe('light');
    expect(resolveInitialTheme('dark', true)).toBe('dark');
  });

  it('falls back to the OS prefers-color-scheme when nothing is stored', () => {
    expect(resolveInitialTheme(null, true)).toBe('light');
    expect(resolveInitialTheme(undefined, false)).toBe('dark');
  });

  it('ignores a malformed stored value and falls back safely', () => {
    expect(resolveInitialTheme('neon', false)).toBe('dark');
    expect(resolveInitialTheme('neon', true)).toBe('light');
  });
});

describe('toggleThemeValue', () => {
  it('flips between dark and light', () => {
    expect(toggleThemeValue('dark')).toBe('light');
    expect(toggleThemeValue('light')).toBe('dark');
  });
});

describe('mapStyleForTheme', () => {
  it('picks the dark-v11 Mapbox style in dark theme', () => {
    expect(mapStyleForTheme('dark')).toBe('mapbox://styles/mapbox/dark-v11');
  });

  it('picks the light-v11 Mapbox style in light theme', () => {
    expect(mapStyleForTheme('light')).toBe('mapbox://styles/mapbox/light-v11');
  });
});
