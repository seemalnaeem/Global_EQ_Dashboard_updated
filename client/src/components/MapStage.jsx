import { forwardRef } from 'react';
import MapView from './MapView.jsx';
import RasterLegend from './RasterLegend.jsx';
import PgaCompare from './PgaCompare.jsx';
import TokenNotice from './TokenNotice.jsx';

// The map stage: the Mapbox flat/globe map, the Three.js depth-globe canvas and
// its country labels layered on top, and the globe mode + zoom controls. Mirrors
// the old portal's #map-stage. The globe canvas/labels are hidden until the
// hollow globe is active (see index.css #map-stage.hollow-active).
const MapStage = forwardRef(function MapStage(
  {
    mapboxToken,
    mapStyle,
    quakesGeoJSON,
    vectorLayers,
    rasterLayers,
    hollowActive,
    onToggleGlobe,
    onGlobeZoomIn,
    onGlobeZoomOut,
    error,
    loading,
    quakeCount,
    onRetry,
    onMapReady,
    rasterLegends,
    compareActive,
    compareRasterLayers
  },
  mapViewRef
) {
  return (
    <div id="map-stage" className={hollowActive ? 'hollow-active' : ''}>
      <MapView
        ref={mapViewRef}
        mapboxToken={mapboxToken}
        mapStyle={mapStyle}
        quakesGeoJSON={quakesGeoJSON}
        vectorLayers={vectorLayers}
        rasterLayers={rasterLayers}
        onMapReady={onMapReady}
      />

      {compareActive && (
        <PgaCompare
          mainMapRef={mapViewRef}
          mapboxToken={mapboxToken}
          mapStyle={mapStyle}
          quakesGeoJSON={quakesGeoJSON}
          vectorLayers={vectorLayers}
          rasterLayers={compareRasterLayers}
        />
      )}

      <canvas id="globe-canvas"></canvas>
      <div id="country-labels"></div>

      <button
        type="button"
        className={`globe-mode-btn${hollowActive ? ' active' : ''}`}
        onClick={onToggleGlobe}
      >
        {hollowActive ? 'Return to Globe Map' : '3D Depth Globe'}
      </button>

      <div id="globe-zoom">
        <button type="button" aria-label="Zoom in" onClick={onGlobeZoomIn}>+</button>
        <button type="button" aria-label="Zoom out" onClick={onGlobeZoomOut}>&minus;</button>
      </div>

      <RasterLegend legends={rasterLegends} />
      <div id="alert-container" className="alertHidden"></div>

      {!mapboxToken && <TokenNotice />}
      {error && (
        <div className="overlay-banner error">
          Failed to load quakes: {error}{' '}
          <button type="button" onClick={onRetry}>Retry</button>
        </div>
      )}
      {!error && !loading && quakeCount === 0 && (
        <div className="overlay-banner">No quakes match the current view.</div>
      )}
    </div>
  );
});

export default MapStage;
