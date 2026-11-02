import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react';
import Map, { Popup, NavigationControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAP_CENTER, MAP_FOG } from '../config.js';
import {
  vectorLayerGeometryKind,
  vectorLayerMapLayerIds,
  vectorLayerLabel,
  vectorLayerHasArrows,
  BOUNDARY_LAYER_NAMES
} from '../utils/vectorLayers.js';
import MapLayers, { arrowImageId, makeArrowImageData, addMissingVectorImage } from './MapLayers.jsx';
import { buildFeatureCard } from '../utils/attributeConfig.js';

// Line layers that open an info card on click (currently fault lines). A
// clicked feature is identified by its MVT sourceLayer, which equals the name.
const CLICKABLE_LINE_LAYERS = new Set(['fault_lines']);

// Point/marker layers that open an event popup on click (historical tsunamis).
const CLICKABLE_MARKER_LAYERS = new Set(['historical_tsunamis']);

// Format an NCEI tsunami year (negative = BC).
function formatTsunamiYear(year) {
  if (year === null || year === undefined || year === '') return null;
  const n = Number(year);
  if (Number.isNaN(n)) return String(year);
  return n < 0 ? `${-n} BC` : String(n);
}
import { formatUtc, formatNumber } from '../utils/format.js';
import BoundaryInfoCard from './BoundaryInfoCard.jsx';

const WORLD_VIEW = { longitude: MAP_CENTER[0], latitude: MAP_CENTER[1], zoom: 1.6 };

const QUAKE_LAYER_IDS = ['quakes-points', 'quakes-labels'];

// Auto-rotation for the Mapbox globe, ported from the old portal's map.js: a
// gentle longitude drift while zoomed out on the globe projection, paused on
// interaction and resumed a few seconds later.
const GLOBE_SECONDS_PER_REVOLUTION = 120;
const GLOBE_MAX_SPIN_ZOOM = 5;
const GLOBE_SPIN_RESUME_MS = 4000;

function installGlobeSpin(map) {
  let userInteracting = false;
  let resumeAt = 0;
  let recheckScheduled = false;

  const spinEnabled = () =>
    map.getProjection().name === 'globe' && map.getZoom() < GLOBE_MAX_SPIN_ZOOM;

  function spin() {
    if (!spinEnabled()) return;
    if (userInteracting || performance.now() < resumeAt) {
      if (!recheckScheduled) {
        recheckScheduled = true;
        window.setTimeout(() => {
          recheckScheduled = false;
          spin();
        }, 250);
      }
      return;
    }
    const center = map.getCenter();
    center.lng -= 360 / GLOBE_SECONDS_PER_REVOLUTION;
    map.easeTo({ center, duration: 1000, easing: (n) => n });
  }

  const pause = () => {
    resumeAt = performance.now() + GLOBE_SPIN_RESUME_MS;
  };

  map.on('mousedown', () => {
    userInteracting = true;
  });
  map.on('dragstart', () => {
    userInteracting = true;
  });
  map.on('mouseup', () => {
    userInteracting = false;
    pause();
  });
  map.on('dragend', () => {
    userInteracting = false;
    pause();
  });
  map.on('wheel', pause);
  map.on('moveend', spin);
  spin();
}

// Resize the map whenever its container (#map-stage) changes size, so the
// canvas always refills its box. Covers window resize, opening/closing dev
// tools, and panel collapse/expand (where only a flex sibling changes). rAF
// debounced so a drag of the dev-tools splitter does not thrash.
function installAutoResize(map) {
  if (!window.ResizeObserver) return;
  const target = map.getContainer().parentElement || map.getContainer();
  let raf = 0;
  const ro = new ResizeObserver(() => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => map.resize());
  });
  ro.observe(target);
  map.on('remove', () => {
    if (raf) cancelAnimationFrame(raf);
    ro.disconnect();
  });
}

function installTerrainAndFog(map) {
  map.setFog(MAP_FOG);
  if (!map.getSource('mapbox-dem')) {
    map.addSource('mapbox-dem', {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14
    });
  }
  map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
}

// The fill layer id of every admin boundary layer, used to build
// interactiveLayerIds and to recognize a boundary click. A polygon layer's
// fill sublayer is the one that covers area, so it is the natural click
// target (the line sublayer only covers a thin outline).
const BOUNDARY_FILL_IDS = new Set(BOUNDARY_LAYER_NAMES.map((name) => `vector-fill-${name}`));

/**
 * Mapbox GL map: quake circles (uniform size, no clustering), toggleable and
 * live-styleable vector layers (drawn in the caller-supplied order), and
 * raster hazard overlays from TiTiler. Renders on a blank background when
 * mapboxToken is empty, never crashes. `mapStyle` is resolved by the caller
 * from the active theme; react-map-gl re-adds child Source/Layer children
 * after a style switch, so overlays persist.
 *
 * `vectorLayers` is an array of { name, visible, style } already sorted so
 * index 0 is the layer that should render on top of the others; a useEffect
 * below enforces that with explicit Mapbox moveLayer calls, since changing
 * this array's order alone does not reorder already-added Mapbox layers.
 */
const MapView = forwardRef(function MapView(
  { mapboxToken, mapStyle, quakesGeoJSON, vectorLayers, rasterLayers, onMapReady },
  forwardedRef
) {
  const mapRef = useRef(null);
  const [popup, setPopup] = useState(null);
  const [boundaryCard, setBoundaryCard] = useState(null);
  const [tsunamiPopup, setTsunamiPopup] = useState(null);

  const focusQuake = useCallback((quake) => {
    if (!quake || !quake.coordinates) return;
    const [lon, lat] = quake.coordinates;
    const map = mapRef.current?.getMap();
    if (map) {
      map.flyTo({ center: [lon, lat], zoom: 6, speed: 1.5, curve: 1, essential: true });
    }
    setBoundaryCard(null);
    setPopup({
      lon,
      lat,
      properties: {
        place: quake.place,
        magnitude: quake.magnitude,
        depthKm: quake.depthKm,
        occurredAt: quake.occurredAt,
        source: quake.source,
        sourceId: quake.sourceId
      }
    });
  }, []);

  useImperativeHandle(
    forwardedRef,
    () => ({
      getMap: () => mapRef.current?.getMap() || null,
      focusQuake
    }),
    [focusQuake]
  );

  const visibleVectorLayers = useMemo(
    () => vectorLayers.filter((layer) => layer.visible),
    [vectorLayers]
  );

  const interactiveLayerIds = useMemo(() => {
    const ids = ['quakes-points'];
    visibleVectorLayers.forEach((layer) => {
      const kind = vectorLayerGeometryKind(layer.name);
      if (kind === 'polygon') {
        ids.push(`vector-fill-${layer.name}`);
      } else if (kind === 'marker') {
        ids.push(`vector-circle-${layer.name}`);
      } else if (CLICKABLE_LINE_LAYERS.has(layer.name)) {
        // the line plus its arrow icons (a bigger target than the thin stroke)
        ids.push(`vector-line-${layer.name}`, `vector-linearrow-${layer.name}`);
      }
    });
    return ids;
  }, [visibleVectorLayers]);

  // Enforces map draw order from the caller's list order: index 0 (top of
  // the list) ends up drawn above every other vector layer. Mapbox's
  // moveLayer(id) with no beforeId appends a layer to the very top of the
  // whole style stack, so processing layers bottom-to-top (reverse of the
  // list) and re-appending each one in turn reconstructs the desired stack.
  // Quakes are re-appended last so they stay above every vector layer.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const bottomToTop = [...visibleVectorLayers].reverse();
    bottomToTop.forEach((layer) => {
      vectorLayerMapLayerIds(layer.name).forEach((layerId) => {
        if (!map.getLayer(layerId)) return;
        try {
          map.moveLayer(layerId);
        } catch {
          // Style may still be swapping (theme toggle); the next effect run
          // (triggered by the same order/visibility deps) retries this.
        }
      });
    });

    QUAKE_LAYER_IDS.forEach((layerId) => {
      if (!map.getLayer(layerId)) return;
      try {
        map.moveLayer(layerId);
      } catch {
        // See above.
      }
    });
    // visibleVectorLayers is memoized above (stable reference unless the
    // caller's vectorLayers prop actually changes), so this only re-runs on
    // a real visibility, order, or catalog change, not every render.
  }, [visibleVectorLayers]);

  // Colors of the currently visible arrow (fault) layers, read by the image
  // loader below without re-binding the map 'style.load' listener each render.
  const arrowColorsRef = useRef([]);
  arrowColorsRef.current = visibleVectorLayers
    .filter((layer) => vectorLayerHasArrows(layer.name))
    .map((layer) => layer.style?.color || '#e01e1e');

  const ensureArrowImages = useCallback((map) => {
    arrowColorsRef.current.forEach((color) => {
      const id = arrowImageId(color);
      if (!map.hasImage(id)) map.addImage(id, makeArrowImageData(color));
    });
  }, []);

  const handleMapLoad = useCallback(
    (event) => {
      const map = event.target;
      ensureArrowImages(map);
      installTerrainAndFog(map);
      installGlobeSpin(map);
      installAutoResize(map);
      // Generate fault-arrow and marker-triangle icons on demand (e.g. right
      // after the user picks a new color) so they never go missing.
      map.on('styleimagemissing', (e) => addMissingVectorImage(map, e.id));
      // A base-map style switch drops added images and terrain; re-add them.
      map.on('style.load', () => {
        ensureArrowImages(map);
        installTerrainAndFog(map);
      });
      if (onMapReady) onMapReady(map);
    },
    [ensureArrowImages, onMapReady]
  );

  // Recoloring or first-showing a fault line needs its arrow image present.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (map && map.isStyleLoaded()) ensureArrowImages(map);
  }, [visibleVectorLayers, ensureArrowImages]);

  function handleClick(event) {
    const features = event.features || [];

    const quakeFeature = features.find((f) => f.layer.id === 'quakes-points');
    if (quakeFeature) {
      setBoundaryCard(null);
      setTsunamiPopup(null);
      setPopup({
        lon: quakeFeature.geometry.coordinates[0],
        lat: quakeFeature.geometry.coordinates[1],
        properties: quakeFeature.properties
      });
      return;
    }

    // Historical tsunami markers -> event popup.
    const markerFeature = features.find((f) => CLICKABLE_MARKER_LAYERS.has(f.sourceLayer));
    if (markerFeature) {
      setPopup(null);
      setBoundaryCard(null);
      setTsunamiPopup({
        lon: event.lngLat.lng,
        lat: event.lngLat.lat,
        properties: markerFeature.properties
      });
      return;
    }

    // Fault lines (and other clickable lines) render above the admin polygons,
    // so check them first: a click on the orange line should show the fault.
    const lineFeature = features.find((f) => CLICKABLE_LINE_LAYERS.has(f.sourceLayer));
    if (lineFeature) {
      setPopup(null);
      setTsunamiPopup(null);
      const layerName = lineFeature.sourceLayer;
      const card = buildFeatureCard(layerName, lineFeature.properties);
      setBoundaryCard(card ? { ...card, layerLabel: vectorLayerLabel(layerName) } : null);
      return;
    }

    const boundaryFeature = features.find((f) => BOUNDARY_FILL_IDS.has(f.layer.id));
    if (boundaryFeature) {
      setPopup(null);
      setTsunamiPopup(null);
      const layerName = boundaryFeature.sourceLayer || boundaryFeature.layer.id.replace('vector-fill-', '');
      const card = buildFeatureCard(layerName, boundaryFeature.properties);
      setBoundaryCard(card ? { ...card, layerLabel: vectorLayerLabel(layerName) } : null);
      return;
    }

    setPopup(null);
    setBoundaryCard(null);
    setTsunamiPopup(null);
  }

  return (
    <>
      <Map
        ref={mapRef}
        initialViewState={WORLD_VIEW}
        minZoom={1}
        projection="globe"
        mapboxAccessToken={mapboxToken || undefined}
        mapStyle={mapboxToken ? mapStyle : undefined}
        style={{ width: '100%', height: '100%', background: 'var(--color-bg-dark)' }}
        interactiveLayerIds={interactiveLayerIds}
        onLoad={handleMapLoad}
        onClick={handleClick}
      >
        {mapboxToken && <NavigationControl position="top-right" />}

        <MapLayers
          quakesGeoJSON={quakesGeoJSON}
          vectorLayers={visibleVectorLayers}
          rasterLayers={rasterLayers}
        />

        {popup && (
          <Popup
            longitude={popup.lon}
            latitude={popup.lat}
            closeOnClick={false}
            onClose={() => setPopup(null)}
          >
            <div>
              <strong>Magnitude: {formatNumber(popup.properties.magnitude)}</strong>
              <br />
              Location: {popup.properties.place || 'Unknown'}
              <br />
              Latitude: {popup.lat.toFixed(2)}&deg;
              <br />
              Longitude: {popup.lon.toFixed(2)}&deg;
              <br />
              Depth: {formatNumber(popup.properties.depthKm, ' km')}
              <br />
              Time: {formatUtc(popup.properties.occurredAt)}
              {popup.properties.source === 'usgs' && popup.properties.sourceId && (
                <>
                  <br />
                  <a
                    className="usgs-popup-link"
                    href={`https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(popup.properties.sourceId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on USGS &#8599;
                  </a>
                </>
              )}
            </div>
          </Popup>
        )}

        {tsunamiPopup && (
          <Popup
            longitude={tsunamiPopup.lon}
            latitude={tsunamiPopup.lat}
            closeOnClick={false}
            onClose={() => setTsunamiPopup(null)}
            maxWidth="280px"
          >
            {(() => {
              const p = tsunamiPopup.properties;
              const when = p.date_str && !String(p.date_str).includes('??')
                ? p.date_str
                : formatTsunamiYear(p.year);
              const place = [p.region, p.country].filter(Boolean).join(', ');
              return (
                <div className="tsunami-popup">
                  <strong>{p.location || p.country || 'Tsunami event'}</strong>
                  {place && (
                    <>
                      <br />
                      {place}
                    </>
                  )}
                  {when && (
                    <>
                      <br />
                      Date: {when}
                    </>
                  )}
                  {p.cause && (
                    <>
                      <br />
                      Cause: {p.cause}
                    </>
                  )}
                  {p.eq_mag != null && (
                    <>
                      <br />
                      Earthquake magnitude: {p.eq_mag}
                    </>
                  )}
                  {p.max_runup != null && (
                    <>
                      <br />
                      Max runup: {p.max_runup} m
                    </>
                  )}
                  {p.ts_intens != null && (
                    <>
                      <br />
                      Tsunami intensity: {p.ts_intens}
                    </>
                  )}
                  {p.death_desc && (
                    <>
                      <br />
                      Deaths: {p.death_desc}
                    </>
                  )}
                  {p.dmg_desc && (
                    <>
                      <br />
                      Damage: {p.dmg_desc}
                    </>
                  )}
                  {p.validity && (
                    <>
                      <br />
                      Validity: {p.validity}
                    </>
                  )}
                  {p.src_url && (
                    <>
                      <br />
                      <a
                        className="usgs-popup-link"
                        href={p.src_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        NCEI source &#8599;
                      </a>
                    </>
                  )}
                </div>
              );
            })()}
          </Popup>
        )}
      </Map>

      <BoundaryInfoCard card={boundaryCard} onClose={() => setBoundaryCard(null)} />
    </>
  );
});

export default MapView;
