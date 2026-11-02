import { useCallback, useEffect, useRef, useState } from 'react';
import Map from 'react-map-gl/mapbox';
import { MAP_FOG } from '../config.js';
import MapLayers, { addMissingVectorImage } from './MapLayers.jsx';

// Swipe comparison overlay for the two PGA hazard layers. The main map (below)
// shows PGA 2026; this overlay renders basemap + PGA 2023 and is clipped to the
// left of a draggable divider, so the left side shows 2023 and the right shows
// 2026. Mounted only while comparison is active (so it seeds from the main map's
// CURRENT camera and the view never jumps), non-interactive, and it mirrors the
// main map's camera on every move via an imperative jumpTo (no per-frame React
// re-render).
export default function PgaCompare({
  mainMapRef,
  mapboxToken,
  mapStyle,
  quakesGeoJSON,
  vectorLayers,
  rasterLayers
}) {
  const overlayRef = useRef(null);
  const containerRef = useRef(null);
  const [dividerX, setDividerX] = useState(null);

  // Seed the overlay from the main map's current camera so both sides show the
  // same space from the first frame (computed once, at mount/activation).
  const [initialView] = useState(() => {
    const main = mainMapRef.current?.getMap?.();
    if (main) {
      const c = main.getCenter();
      return {
        longitude: c.lng,
        latitude: c.lat,
        zoom: main.getZoom(),
        bearing: main.getBearing(),
        pitch: main.getPitch()
      };
    }
    return { longitude: 20, latitude: 10, zoom: 1.6 };
  });

  // Mirror the overlay camera to the main map (used on main 'move' and on
  // overlay load so it lines up before the first interaction).
  const syncToMain = useCallback(() => {
    const main = mainMapRef.current?.getMap?.();
    const overlay = overlayRef.current?.getMap?.();
    if (!main || !overlay) return;
    const c = main.getCenter();
    overlay.jumpTo({
      center: [c.lng, c.lat],
      zoom: main.getZoom(),
      bearing: main.getBearing(),
      pitch: main.getPitch()
    });
  }, [mainMapRef]);

  useEffect(() => {
    const main = mainMapRef.current?.getMap?.();
    if (!main) return undefined;
    syncToMain();
    main.on('move', syncToMain);
    return () => main.off('move', syncToMain);
  }, [mainMapRef, syncToMain]);

  // Match the main map's atmosphere/space background, generate fault arrow
  // images on demand, then align the camera.
  const handleOverlayLoad = useCallback(
    (e) => {
      const map = e.target;
      map.setFog(MAP_FOG);
      map.on('styleimagemissing', (ev) => addMissingVectorImage(map, ev.id));
      syncToMain();
    },
    [syncToMain]
  );

  // Start the divider centered.
  useEffect(() => {
    if (dividerX === null && containerRef.current) {
      setDividerX(containerRef.current.clientWidth / 2);
    }
  }, [dividerX]);

  const startDrag = useCallback((e) => {
    e.preventDefault();
    const move = (ev) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      setDividerX(Math.max(0, Math.min(rect.width, clientX - rect.left)));
    };
    const stop = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', stop);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', stop);
  }, []);

  const x = dividerX ?? 0;
  const clip = `inset(0 calc(100% - ${x}px) 0 0)`;

  return (
    <div className="pga-compare" ref={containerRef}>
      <div className="pga-compare-left" style={{ clipPath: clip, WebkitClipPath: clip }}>
        <Map
          ref={overlayRef}
          initialViewState={initialView}
          projection="globe"
          interactive={false}
          mapboxAccessToken={mapboxToken || undefined}
          mapStyle={mapboxToken ? mapStyle : undefined}
          style={{ width: '100%', height: '100%' }}
          onLoad={handleOverlayLoad}
        >
          <MapLayers
            quakesGeoJSON={quakesGeoJSON}
            vectorLayers={vectorLayers}
            rasterLayers={rasterLayers}
          />
        </Map>
      </div>

      <div className="pga-compare-label left">PGA 2023</div>
      <div className="pga-compare-label right">PGA 2026</div>

      <div
        className="pga-compare-divider"
        style={{ left: `${x}px` }}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
        role="separator"
        aria-label="Drag to compare 2023 and 2026"
      >
        <div className="pga-compare-handle">&#8646;</div>
      </div>
    </div>
  );
}
