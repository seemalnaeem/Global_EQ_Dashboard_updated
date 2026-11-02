import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server binds 0.0.0.0:5177, strictPort true (see docker-compose CLIENT_PORT).
// Proxies keep the client on relative /api /geo /ws /tiles paths so it stays
// IP-independent. /tiles strips the prefix so TiTiler's /cog/... routes resolve.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5177,
    strictPort: true,
    // Poll for file changes: Docker Desktop on Windows does not forward native
    // inotify events across the bind mount, so HMR needs polling to see host edits.
    watch: { usePolling: true, interval: 300 },
    proxy: {
      '/api': {
        target: 'http://server:3090',
        changeOrigin: true
      },
      '/geo': {
        target: 'http://geo:3091',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/geo/, '')
      },
      '/ws': {
        target: 'ws://server:3090',
        ws: true
      },
      '/tiles': {
        target: 'http://titiler:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tiles/, '')
      }
    }
  },
  test: {
    // jsdom provides window/document for DOM-touching pure functions
    // (buildVectorTileUrl anchors to window.location.origin, useTheme
    // reads localStorage) without mounting components or testing pixels.
    environment: 'jsdom'
  }
});
