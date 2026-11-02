// Pure theme helpers. Kept free of React/DOM so they stay easy to unit test;
// useTheme.js wires these to localStorage, matchMedia, and the document root.

export const THEMES = ['dark', 'light'];

// Picks the initial theme: an explicit stored choice wins, otherwise fall
// back to the OS color-scheme preference, defaulting to dark.
export function resolveInitialTheme(stored, prefersLight) {
  if (stored === 'dark' || stored === 'light') return stored;
  return prefersLight ? 'light' : 'dark';
}

export function toggleThemeValue(theme) {
  return theme === 'dark' ? 'light' : 'dark';
}

// The Mapbox base style follows the active theme so it stays legible in
// both. Overlays (vectors, rasters, quakes) are unaffected by style swaps;
// react-map-gl re-adds child Source/Layer children after the style loads.
export function mapStyleForTheme(theme) {
  return theme === 'light' ? 'mapbox://styles/mapbox/light-v11' : 'mapbox://styles/mapbox/dark-v11';
}
