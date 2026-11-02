// Pulse animations on the Mapbox map, ported from the old portal's pulse.js
// (single newest-event pulse) and pulse24h.js (rings around every quake in the
// last 24h). Consumes normalized quakes ({ coordinates: [lon, lat], occurredAt,
// id }). Created once the map is ready; safe to call before layers exist.
import { PULSE_24H_WINDOW_MS } from '../config.js';

// ----- single newest-event pulse -----
const PULSE_LAYER_IDS = ['pulse-circle-0', 'pulse-circle-1', 'pulse-circle-2'];
const PULSE_COLOR = '#8b0000';
const PULSE_MAX_OPACITY = 0.85;
const PULSE_STROKE_COLOR = '#ffffff';
const PULSE_STROKE_WIDTH = 2;

// ----- last-24h pulse -----
const PULSE_24H_CORE_GLOW_ID = 'pulse-24h-core-glow';
const PULSE_24H_CORE_DOT_ID = 'pulse-24h-core-dot';
const PULSE_24H_RING_LAYER_IDS = [
  'pulse-24h-0', 'pulse-24h-1', 'pulse-24h-2', 'pulse-24h-3',
  'pulse-24h-4', 'pulse-24h-5', 'pulse-24h-6', 'pulse-24h-7'
];
const PULSE_24H_LAYER_IDS = [PULSE_24H_CORE_GLOW_ID, ...PULSE_24H_RING_LAYER_IDS, PULSE_24H_CORE_DOT_ID];
const PULSE_24H_MAX_OPACITY = 1;
const PULSE_24H_STROKE_COLOR = '#a00000';
const PULSE_24H_STROKE_WIDTH = 3;
const PULSE_24H_LINE_BLUR = 0.6;
const PULSE_24H_MAX_RADIUS_KM = 750;
const PULSE_24H_STEP_KM = 22;
const PULSE_24H_CIRCLE_STEPS = 48;
const PULSE_24H_GLOW_RADIUS = 34;
const PULSE_24H_GLOW_COLOR = '#ff5a00';
const PULSE_24H_GLOW_OPACITY = 0.5;
const PULSE_24H_CORE_RADIUS = 6;
const PULSE_24H_CORE_COLOR = '#ffe37a';
const PULSE_24H_REFRESH_MS = 60000;

function pointCollection(centers) {
  return {
    type: 'FeatureCollection',
    features: centers.map((c) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c } }))
  };
}

// A closed geodesic ring a fixed distance (km) from the centre, so on the globe
// it wraps onto the surface. Longitudes stay continuous across the antimeridian.
function geodesicCircle(lon, lat, radiusKm) {
  const R = 6371;
  const latR = (lat * Math.PI) / 180;
  const lonR = (lon * Math.PI) / 180;
  const d = radiusKm / R;
  const sinLat = Math.sin(latR);
  const cosLat = Math.cos(latR);
  const sinD = Math.sin(d);
  const cosD = Math.cos(d);

  const coords = [];
  for (let k = 0; k <= PULSE_24H_CIRCLE_STEPS; k++) {
    const brng = (k / PULSE_24H_CIRCLE_STEPS) * 2 * Math.PI;
    const lat2 = Math.asin(sinLat * cosD + cosLat * sinD * Math.cos(brng));
    const lon2 = lonR + Math.atan2(Math.sin(brng) * sinD * cosLat, cosD - sinLat * Math.sin(lat2));
    coords.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return coords;
}

function ringCollection(centers, radiusKm) {
  return {
    type: 'FeatureCollection',
    features: centers.map((c) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: geodesicCircle(c[0], c[1], radiusKm) }
    }))
  };
}

export function createPulseController(map) {
  let pulseIntervals = [];
  let pulseTimeouts = [];
  let p24Intervals = [];
  let p24Timeouts = [];
  let p24RefreshTimer = null;
  let p24Active = false;
  let p24Centers = [];
  let latestQuakes = [];
  let lastNewestId = null;

  function raiseLayers() {
    [...PULSE_LAYER_IDS, ...PULSE_24H_LAYER_IDS].forEach((id) => {
      if (map.getLayer(id)) {
        try {
          map.moveLayer(id);
        } catch {
          // style may be swapping; ignore
        }
      }
    });
  }

  function last24hCoords() {
    const cutoff = Date.now() - PULSE_24H_WINDOW_MS;
    return latestQuakes
      .filter((q) => {
        const t = new Date(q.occurredAt).getTime();
        return !Number.isNaN(t) && t >= cutoff && Array.isArray(q.coordinates);
      })
      .map((q) => [q.coordinates[0], q.coordinates[1]]);
  }

  // ----- newest-event pulse -----
  function animatePulseCircle(id, delay) {
    let radius = 0;
    const maxRadius = 60;
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        if (!map.getLayer(id)) return;
        radius += 2;
        if (radius > maxRadius) radius = 0;
        const fade = 1 - radius / maxRadius;
        map.setPaintProperty(id, 'circle-radius', radius);
        map.setPaintProperty(id, 'circle-opacity', fade * PULSE_MAX_OPACITY);
        map.setPaintProperty(id, 'circle-stroke-opacity', fade);
      }, 100);
      pulseIntervals.push(interval);
    }, delay);
    pulseTimeouts.push(timeout);
  }

  function showNewest(coords) {
    pulseIntervals.forEach(clearInterval);
    pulseTimeouts.forEach(clearTimeout);
    pulseIntervals = [];
    pulseTimeouts = [];

    PULSE_LAYER_IDS.forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    });

    PULSE_LAYER_IDS.forEach((id, i) => {
      map.addSource(id, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: coords } }] }
      });
      map.addLayer({
        id,
        type: 'circle',
        source: id,
        paint: {
          'circle-radius': 0,
          'circle-color': PULSE_COLOR,
          'circle-opacity': PULSE_MAX_OPACITY,
          'circle-stroke-width': PULSE_STROKE_WIDTH,
          'circle-stroke-color': PULSE_STROKE_COLOR,
          'circle-stroke-opacity': 1
        }
      });
      animatePulseCircle(id, i * 800);
    });

    raiseLayers();
  }

  // ----- last-24h pulse -----
  function animate24hRing(id, delay) {
    let radiusKm = 0;
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        if (!map.getLayer(id) || !map.getSource(id)) return;
        radiusKm += PULSE_24H_STEP_KM;
        if (radiusKm > PULSE_24H_MAX_RADIUS_KM) radiusKm = 0;
        const fade = 1 - radiusKm / PULSE_24H_MAX_RADIUS_KM;
        map.getSource(id).setData(ringCollection(p24Centers, Math.max(radiusKm, 0.01)));
        map.setPaintProperty(id, 'line-opacity', Math.sqrt(fade) * PULSE_24H_MAX_OPACITY);
      }, 100);
      p24Intervals.push(interval);
    }, delay);
    p24Timeouts.push(timeout);
  }

  function addStatic24hLayer(id, data, paint) {
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
    map.addSource(id, { type: 'geojson', data });
    map.addLayer({ id, type: 'circle', source: id, paint });
  }

  function refresh24hData() {
    if (!p24Active) return;
    p24Centers = last24hCoords();
    const points = pointCollection(p24Centers);
    [PULSE_24H_CORE_GLOW_ID, PULSE_24H_CORE_DOT_ID].forEach((id) => {
      const src = map.getSource(id);
      if (src) src.setData(points);
    });
  }

  function startPulse24h() {
    p24Centers = last24hCoords();
    const points = pointCollection(p24Centers);

    addStatic24hLayer(PULSE_24H_CORE_GLOW_ID, points, {
      'circle-radius': PULSE_24H_GLOW_RADIUS,
      'circle-color': PULSE_24H_GLOW_COLOR,
      'circle-opacity': PULSE_24H_GLOW_OPACITY,
      'circle-blur': 1
    });

    const cycleMs = (PULSE_24H_MAX_RADIUS_KM / PULSE_24H_STEP_KM) * 100;
    PULSE_24H_RING_LAYER_IDS.forEach((id, i) => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
      map.addSource(id, { type: 'geojson', data: ringCollection(p24Centers, 0.01) });
      map.addLayer({
        id,
        type: 'line',
        source: id,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': PULSE_24H_STROKE_COLOR,
          'line-width': PULSE_24H_STROKE_WIDTH,
          'line-blur': PULSE_24H_LINE_BLUR,
          'line-opacity': PULSE_24H_MAX_OPACITY
        }
      });
      animate24hRing(id, i * Math.round(cycleMs / PULSE_24H_RING_LAYER_IDS.length));
    });

    addStatic24hLayer(PULSE_24H_CORE_DOT_ID, points, {
      'circle-radius': PULSE_24H_CORE_RADIUS,
      'circle-color': PULSE_24H_CORE_COLOR,
      'circle-opacity': 0.95,
      'circle-blur': 0.5
    });

    raiseLayers();
    p24RefreshTimer = setInterval(refresh24hData, PULSE_24H_REFRESH_MS);
  }

  function stopPulse24h() {
    p24Intervals.forEach(clearInterval);
    p24Timeouts.forEach(clearTimeout);
    p24Intervals = [];
    p24Timeouts = [];
    if (p24RefreshTimer) {
      clearInterval(p24RefreshTimer);
      p24RefreshTimer = null;
    }
    PULSE_24H_LAYER_IDS.forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    });
  }

  return {
    // Update the data set. Pulses the newest event when it changes, and keeps
    // the 24h ring set current when active.
    setData(quakes, active) {
      latestQuakes = Array.isArray(quakes) ? quakes : [];
      p24Active = !!active;

      const newest = latestQuakes.reduce((best, q) => {
        const t = new Date(q.occurredAt).getTime();
        return !best || t > best.t ? { t, q } : best;
      }, null);

      if (newest && newest.q.id !== lastNewestId && Array.isArray(newest.q.coordinates)) {
        lastNewestId = newest.q.id;
        showNewest(newest.q.coordinates);
      }
      if (p24Active) refresh24hData();
    },
    setPulse24h(active) {
      p24Active = !!active;
      if (p24Active) startPulse24h();
      else stopPulse24h();
    },
    destroy() {
      pulseIntervals.forEach(clearInterval);
      pulseTimeouts.forEach(clearTimeout);
      stopPulse24h();
      PULSE_LAYER_IDS.forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      });
    }
  };
}
