import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuakes } from './hooks/useQuakes.js';
import { useVectorLayers } from './hooks/useVectorLayers.js';
import { useRasterCatalog } from './hooks/useRasterCatalog.js';
import { useHazardLayers } from './hooks/useHazardLayers.js';
import { quakesToFeatureCollection } from './utils/quake.js';
import { buildTileUrl, buildDiscreteTileUrl } from './utils/rasterTiles.js';
import { buildHazardTileUrl } from './utils/hazardTiles.js';
import { MAP_STYLE, RASTER_HAZARD } from './config.js';
import { defaultFilterParams } from './utils/quakeFilter.js';
import { createPulseController } from './map/pulseController.js';
import Navbar from './components/Navbar.jsx';
import ControlPanel from './components/ControlPanel.jsx';
import MapStage from './components/MapStage.jsx';
import QuakeTable from './components/QuakeTable.jsx';
import RightPanel from './components/RightPanel.jsx';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

export default function App() {
  const [controlsOpen, setControlsOpen] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [tableOpen, setTableOpen] = useState(true);
  const [appliedFilter, setAppliedFilter] = useState(defaultFilterParams);
  const [pulse24hActive, setPulse24hActive] = useState(false);
  const [hollowActive, setHollowActive] = useState(false);
  const [compareActive, setCompareActive] = useState(false);

  const { quakes, total, loading, error, reload } = useQuakes(appliedFilter);
  const vectorLayers = useVectorLayers();
  const rasters = useRasterCatalog();
  const hazard = useHazardLayers();

  const mapViewRef = useRef(null);
  const pulseRef = useRef(null);
  const globeRef = useRef(null);

  const quakesGeoJSON = useMemo(() => quakesToFeatureCollection(quakes), [quakes]);

  // Sorted by vectorLayers.order (index 0 = drawn on top); MapView enforces
  // this on the map via moveLayer.
  const vectorLayerDefs = useMemo(() => {
    const catalogNames = new Set(vectorLayers.catalog.map((entry) => entry.name));
    return vectorLayers.order
      .filter((name) => catalogNames.has(name))
      .map((name) => ({
        name,
        visible: !!vectorLayers.visibility[name],
        style: vectorLayers.styles[name]
      }));
  }, [vectorLayers.order, vectorLayers.catalog, vectorLayers.visibility, vectorLayers.styles]);

  const rasterLayerDefs = useMemo(
    () =>
      rasters.catalog.map((entry) => {
        const state = rasters.controls[entry.name];
        if (!state) return { name: entry.name, visible: false };
        const hazard = RASTER_HAZARD[entry.name];
        const tileUrl = !state.visible
          ? null
          : hazard
            ? buildDiscreteTileUrl(entry, hazard.colormap)
            : buildTileUrl(entry, state);
        return {
          name: entry.name,
          visible: state.visible,
          opacity: state.opacity,
          tileUrl
        };
      }),
    [rasters.catalog, rasters.controls]
  );

  // Legends for the raster overlays that are currently on (colormap + bounds).
  const rasterLegends = useMemo(
    () =>
      rasters.catalog
        .filter((entry) => rasters.controls[entry.name]?.visible)
        .map((entry) => {
          const state = rasters.controls[entry.name];
          const hazard = RASTER_HAZARD[entry.name];
          return {
            name: entry.name,
            title: hazard?.title || entry.title || entry.name,
            classes: hazard?.legend || null,
            colormap: state.colormap,
            min: state.rescaleMin,
            max: state.rescaleMax
          };
        }),
    [rasters.catalog, rasters.controls]
  );

  // Hazard (OpenQuake PGA) raster layers, proxied through /api/hazard-tiles.
  // In compare mode the main map always shows PGA 2026 (the swipe overlay draws
  // PGA 2023 on top, clipped); otherwise each layer follows its own toggle.
  const hazardLayerDefs = useMemo(() => {
    if (compareActive) {
      return [{ name: 'pga_2026', visible: true, opacity: 1, tileUrl: buildHazardTileUrl('pga_2026') }];
    }
    return hazard.catalog.map((entry) => {
      const state = hazard.controls[entry.name];
      const visible = !!state?.visible;
      return {
        name: entry.name,
        visible,
        opacity: state?.opacity ?? 0.8,
        tileUrl: visible ? buildHazardTileUrl(entry.name) : null
      };
    });
  }, [compareActive, hazard.catalog, hazard.controls]);

  // Raster + hazard layers share MapView's raster rendering path.
  const allRasterLayers = useMemo(
    () => [...rasterLayerDefs, ...hazardLayerDefs],
    [rasterLayerDefs, hazardLayerDefs]
  );

  // The compare overlay (left/2023 side) shows the same non-hazard rasters as
  // the main map, but PGA 2023 instead of PGA 2026.
  const compareRasterLayers = useMemo(() => {
    if (!compareActive) return [];
    return [
      ...rasterLayerDefs,
      { name: 'pga_2023', visible: true, opacity: 1, tileUrl: buildHazardTileUrl('pga_2023') }
    ];
  }, [compareActive, rasterLayerDefs]);

  const hazardLegends = useMemo(() => {
    if (compareActive) {
      const entry = hazard.catalog.find((e) => e.name === 'pga_2026');
      return entry ? [{ name: 'pga_compare', title: 'PGA Hazard (g)', classes: entry.legend }] : [];
    }
    return hazard.catalog
      .filter((entry) => hazard.controls[entry.name]?.visible)
      .map((entry) => ({ name: entry.name, title: entry.title, classes: entry.legend }));
  }, [compareActive, hazard.catalog, hazard.controls]);

  const allLegends = useMemo(() => [...rasterLegends, ...hazardLegends], [rasterLegends, hazardLegends]);

  // Map ready: build the pulse controller and seed it with the current data.
  const handleMapReady = useCallback(
    (map) => {
      pulseRef.current = createPulseController(map);
      pulseRef.current.setData(quakes, pulse24hActive);
      if (globeRef.current) globeRef.current.setEarthquakes(quakes);
    },
    // Only wire once on map load; later data changes flow through the effects
    // below. quakes/pulse24hActive intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Push new quake data to the pulse controller and the globe.
  useEffect(() => {
    if (pulseRef.current) pulseRef.current.setData(quakes, pulse24hActive);
    if (globeRef.current) globeRef.current.setEarthquakes(quakes);
  }, [quakes, pulse24hActive]);

  // Toggle the last-24h pulse.
  useEffect(() => {
    if (pulseRef.current) pulseRef.current.setPulse24h(pulse24hActive);
  }, [pulse24hActive]);

  // The controls drawer resizes the map area; Mapbox needs an explicit resize
  // once the transition settles.
  useEffect(() => {
    const id = window.setTimeout(() => {
      mapViewRef.current?.getMap()?.resize();
    }, 320);
    return () => window.clearTimeout(id);
  }, [controlsOpen, rightCollapsed, tableOpen]);

  const handleSelectQuake = useCallback((quake) => {
    mapViewRef.current?.focusQuake(quake);
    if (globeRef.current) globeRef.current.focusOn(quake.coordinates[0], quake.coordinates[1], true);
  }, []);

  // Lazily create the Three.js depth globe on first toggle (keeps the heavy
  // module out of the initial render).
  const ensureGlobe = useCallback(async () => {
    if (globeRef.current) return globeRef.current;
    const map = mapViewRef.current?.getMap();
    if (!map) return null;
    try {
      const mod = await import('./globe/globe.js');
      globeRef.current = mod.createGlobe({ map, onHollowChange: setHollowActive });
      globeRef.current.setEarthquakes(quakes);
      return globeRef.current;
    } catch (err) {
      // Globe is optional; if Three.js or the module fails, keep the flat map.
      console.error('Globe init failed:', err);
      return null;
    }
  }, [quakes]);

  const handleToggleGlobe = useCallback(async () => {
    const globe = await ensureGlobe();
    if (!globe) return;
    globe.setHollowGlobe(!hollowActive);
  }, [ensureGlobe, hollowActive]);

  const handleGlobeZoomIn = useCallback(() => globeRef.current?.zoomStep(1), []);
  const handleGlobeZoomOut = useCallback(() => globeRef.current?.zoomStep(-1), []);

  return (
    <>
      <Navbar />

      <main className={controlsOpen ? 'controls-open' : ''}>
        <div id="usgs-container">
          <ControlPanel
            onToggle={() => setControlsOpen((v) => !v)}
            onToggleTable={() => setTableOpen((v) => !v)}
            filter={{
              onApply: setAppliedFilter,
              loading,
              shown: quakes.length,
              total,
              error
            }}
            layers={{
              vectorLayers,
              rasters,
              pulse24hActive,
              onTogglePulse24h: () => setPulse24hActive((v) => !v)
            }}
            hazard={{
              catalog: hazard.catalog,
              controls: hazard.controls,
              onToggle: (name) =>
                hazard.updateControl(name, { visible: !hazard.controls[name]?.visible }),
              compareActive,
              onToggleCompare: () => setCompareActive((v) => !v)
            }}
          />

          <div id="left-panel" className={tableOpen ? '' : 'collapsed'}>
            <QuakeTable quakes={quakes} onSelect={handleSelectQuake} />
          </div>

          <MapStage
            ref={mapViewRef}
            mapboxToken={MAPBOX_TOKEN}
            mapStyle={MAP_STYLE}
            quakesGeoJSON={quakesGeoJSON}
            vectorLayers={vectorLayerDefs}
            rasterLayers={allRasterLayers}
            hollowActive={hollowActive}
            onToggleGlobe={handleToggleGlobe}
            onGlobeZoomIn={handleGlobeZoomIn}
            onGlobeZoomOut={handleGlobeZoomOut}
            onMapReady={handleMapReady}
            error={error}
            loading={loading}
            quakeCount={quakes.length}
            onRetry={reload}
            rasterLegends={allLegends}
            compareActive={compareActive}
            compareRasterLayers={compareRasterLayers}
          />

          <RightPanel
            quakes={quakes}
            collapsed={rightCollapsed}
            onToggle={() => setRightCollapsed((v) => !v)}
          />
        </div>
      </main>
    </>
  );
}
