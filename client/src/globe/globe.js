/*
 * Hollow rotating globe (Three.js) layered over the Mapbox flat map.
 *
 * Globe mode  : wireframe sphere + country outlines + country name labels,
 *               quake points placed at their true depth inside the shell.
 * Flat mode   : the Mapbox map underneath (MapView.jsx owns all of its layers).
 *
 * Zooming past MAP_SWITCH_Z hands over to Mapbox; zooming Mapbox back out
 * past MAP_EXIT_ZOOM hands back to the globe, keeping the same centre.
 *
 * Ported from the old portal's classic script (src/globe/globe.js) into an ES
 * module. The old file read `map`, THREE and several DOM ids off `window`;
 * this version takes `map` as an argument and imports THREE, so importing
 * this module never touches globals and never throws. All DOM lookups are
 * guarded: if the containers this needs are missing, createGlobe() returns a
 * safe no-op stub instead of throwing, mirroring the old DISABLED_GLOBE.
 */
import * as THREE from 'three';

// Same palette and colour buckets as the fixed magnitude scale (see
// client/src/utils/quake.js magnitudeColor / rules/geospatial.md).
const MAG_COLORS = [
  { min: 6.1, rgb: [139, 43, 43], size: 11 },
  { min: 5.1, rgb: [216, 146, 17], size: 8.5 },
  { min: 4.1, rgb: [44, 193, 204], size: 6.5 },
  { min: -Infinity, rgb: [116, 175, 116], size: 5 }
];

// Pulse ring colours, copied from the old portal's src/config.js (PULSE_*
// constants) since those lived as classic-script globals there and are not
// available to this module.
const PULSE_COLOR_HEX = 0x8b0000;
const PULSE_MAX_OPACITY = 0.85;
const PULSE_24H_CORE_RADIUS = 6;
const PULSE_24H_CORE_COLOR_HEX = 0xffe37a;
const PULSE_24H_STROKE_COLOR_HEX = 0xa00000;
const PULSE_24H_MAX_OPACITY = 1;

const COUNTRY_URLS = [
  'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson',
  'https://cdn.jsdelivr.net/gh/datasets/geo-countries@master/data/countries.geojson',
  'https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/110m/cultural/ne_110m_admin_0_countries.geojson'
];

// Overlay line colours mirror the Mapbox vector layers (fault_lines,
// tectonic_boundaries) in MapView.jsx / utils/vectorLayers.js. nameProp marks
// an overlay as clickable: its features are kept as separate objects so a
// raycast can report which one was hit.
const OVERLAYS = {
  'global-tectonic-layer': { key: 'global-tectonic', color: 0xff0404, opacity: 1, linewidth: 3, nameProp: 'Name' },
  'global-faultlines-layer': { key: 'global-faultlines', color: 0x72269e, opacity: 0.95, linewidth: 2 }
};

const noop = () => {};

// Same shape as the real API, every method a safe no-op. Returned when the
// stage/canvas/labels containers are missing, or three.js failed to load, so
// callers never have to guard every call.
function disabledGlobe() {
  return {
    setEarthquakes: noop,
    setOverlay: noop,
    pulse: noop,
    clearPulse: noop,
    pulse24h: noop,
    clearPulse24h: noop,
    focusOn: noop,
    setPlateNames: noop,
    setHollowGlobe: noop,
    zoomStep: noop,
    isHollowActive: () => false
  };
}

export function createGlobe({ map, onHollowChange } = {}) {
  const notifyHollowChange = typeof onHollowChange === 'function' ? onHollowChange : noop;

  const stage = document.getElementById('map-stage');
  const canvas = document.getElementById('globe-canvas');
  const labelLayer = document.getElementById('country-labels');

  if (!map || !stage || !canvas || !labelLayer) {
    console.warn('createGlobe: missing map or globe containers, globe disabled');
    return disabledGlobe();
  }

  const GLOBE_R = 170;

  // Vertical tilt limit. A quarter turn puts a pole dead centre and no further,
  // which is exactly the range atan2(vy, h) produces in rotationFor(), so any
  // latitude can be centred. A tighter limit would leave polar quakes off-centre.
  const MAX_TILT = Math.PI / 2;

  const MIN_GLOBE_Z = 238; // closest the camera may get before handover
  const MAX_GLOBE_Z = 900;
  const MAP_EXIT_ZOOM = 2.6; // mapbox zoom that hands back to the globe
  const DEPTH_MAX_KM = 700;

  // Hand over to the flat map once the camera is closer than this fraction of
  // the fit distance. Derived from the fit (not a fixed z) so it works at any
  // panel shape; a higher fraction hands over after less zoom-in.
  const MAP_SWITCH_FRAC = 0.62;
  const ZOOM_STEP = 70; // camera-z change per zoom button press

  let W = stage.clientWidth || 1;
  let H = stage.clientHeight || 1;

  // The hollow globe is off at startup: the app opens on the Mapbox globe. The
  // "3D Depth Globe" button flips this on via setHollowGlobe(true). While it
  // is false the render loop is dormant and the canvas stays hidden.
  let active = false;
  let mode = 'globe';
  let quakes = [];
  let countryLabels = [];
  let ptMesh = null;
  let pulseGroup = null;
  let pulse24hGroup = null;

  // Camera-z at which the flat map takes over, as a distance (see MAP_SWITCH_FRAC)
  function mapSwitchZ() {
    return fitCameraZ() * MAP_SWITCH_FRAC;
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.setClearColor(0x122c3c);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, W / H, 1, 5000);

  /*
   * Camera distance at which the whole globe fits in view, with a little air
   * around it. Derived rather than hardcoded, so it stays right whatever shape
   * the panel is at the current breakpoint.
   *
   * A sphere of radius R fits a field of view F at distance R / sin(F/2). The
   * camera's `fov` is vertical, so a narrow panel is limited by the horizontal
   * field instead, take whichever of the two is tighter.
   */
  const GLOBE_FIT_MARGIN = 1.4; // larger => camera sits further back (more zoomed out)

  function fitCameraZ() {
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (W / H));
    const tightest = Math.min(vFov, hFov);

    return (GLOBE_R * GLOBE_FIT_MARGIN) / Math.sin(tightest / 2);
  }

  camera.position.z = fitCameraZ();
  let targetCameraZ = camera.position.z;

  const globe = new THREE.Group();
  scene.add(globe);

  const overlayObjects = {}; // layerId -> THREE.LineSegments | Group
  const overlayLoading = {}; // layerId -> Promise

  const controls = {
    targetRotX: 0,
    targetRotY: 0,
    velX: 0,
    velY: 0,
    zoomVel: 0,
    damping: 0.9,
    rotateEase: 0.18,
    zoomEase: 0.22 // a touch quicker so zoom-in reaches the handover sooner
  };
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastMoveTime = 0;

  // The globe always spins; interacting only pauses it briefly
  const SPIN_RESUME_MS = 4000;
  let spinPausedUntil = 0;
  function pauseSpin() {
    spinPausedUntil = performance.now() + SPIN_RESUME_MS;
  }

  const raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: 2.0 };
  raycaster.params.Line = { threshold: 2.5 };
  const mouse = new THREE.Vector2();

  const tooltip = document.createElement('div');
  tooltip.className = 'globe-tooltip';
  stage.appendChild(tooltip);

  // Click popup for named overlays (tectonic plate boundaries)
  const popup = document.createElement('div');
  popup.className = 'globe-popup';
  popup.style.display = 'none';
  stage.appendChild(popup);

  // A drag ends in a click event too; only a click that barely moved is a pick
  let pressX = 0;
  let pressY = 0;
  let dragMoved = false;

  function hidePopup() {
    popup.style.display = 'none';
  }

  function showPopup(name, x, y) {
    popup.innerHTML =
      '<button type="button" class="globe-popup-close" aria-label="Close">&times;</button>' +
      `<strong>${name}</strong>`;
    popup.querySelector('.globe-popup-close').addEventListener('click', hidePopup);

    popup.style.display = 'block';
    popup.style.left = Math.min(x, Math.max(0, W - popup.offsetWidth - 8)) + 'px';
    popup.style.top = Math.max(0, y - popup.offsetHeight - 10) + 'px';
  }

  // Hit-test the visible named overlays and report the feature's name
  function pickOverlay(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    mouse.set(((clientX - rect.left) / W) * 2 - 1, -((clientY - rect.top) / H) * 2 + 1);
    raycaster.setFromCamera(mouse, camera);

    const targets = [];
    Object.keys(overlayObjects).forEach((id) => {
      const obj = overlayObjects[id];
      if (obj.visible && OVERLAYS[id].nameProp) targets.push(...obj.children);
    });
    if (!targets.length) return null;

    const hits = raycaster.intersectObjects(targets, false);
    if (!hits.length) return null;

    // Ignore boundaries on the far side of the globe
    const camNorm = camera.position.clone().normalize();
    const hit = hits.find((h) => h.point.clone().normalize().dot(camNorm) > 0);
    if (!hit) return null;

    return hit.object.userData.name || null;
  }

  /* ---------- math helpers ---------- */

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Polar angle from the north pole, so y = r*sin(lat): north maps to +y.
  // Keep this in sync with vecToLonLat below.
  function ll2v(lon, lat, r) {
    const phi = ((90 - lat) * Math.PI) / 180;
    const th = ((lon + 180) * Math.PI) / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(th),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(th)
    );
  }

  // Exact inverse of ll2v
  function vecToLonLat(v) {
    const n = v.clone().normalize();
    const lat = (Math.asin(n.y) * 180) / Math.PI;
    let lon = (Math.atan2(n.z, -n.x) * 180) / Math.PI - 180;
    while (lon < -180) lon += 360;
    while (lon > 180) lon -= 360;
    return { lon, lat };
  }

  function getFrontCenterLonLat() {
    const localFront = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(globe.quaternion.clone().invert())
      .normalize();
    return vecToLonLat(localFront);
  }

  /*
   * Rotation that brings (lon,lat) to the point of the globe facing the camera.
   *
   * Only rotation.x and rotation.y are ever set (z stays 0), and three.js
   * composes those in XYZ order as R = Rx(rx) . Ry(ry). Solving R.v = +z for
   * v = ll2v(lon,lat) gives a closed form:
   *
   *   h  = hypot(vx, vz)          the vector's length in the xz plane
   *   ry = atan2(-vx, vz)         swing it into the yz plane
   *   rx = atan2(vy, h)           then tilt it up onto +z
   */
  function rotationFor(lon, lat) {
    const v = ll2v(lon, lat, 1).normalize();
    const h = Math.hypot(v.x, v.z);

    return {
      x: clamp(Math.atan2(v.y, h), -MAX_TILT, MAX_TILT),
      y: Math.atan2(-v.x, v.z)
    };
  }

  function setGlobeToLonLat(lon, lat) {
    const r = rotationFor(lon, lat);
    controls.targetRotX = r.x;
    controls.targetRotY = r.y;
    globe.rotation.x = r.x;
    globe.rotation.y = r.y;
  }

  /*
   * Ease the globe around to an epicentre, matching the flyTo the flat map
   * performs. Spin resumes once the pause elapses.
   *
   * zoomIn is false for the automatic alert on a new earthquake: that should
   * turn the globe to the epicentre and leave the camera where the user put it.
   */
  function focusOn(lon, lat, zoomIn = false) {
    if (lon == null || lat == null || Number.isNaN(lon) || Number.isNaN(lat)) return;
    const r = rotationFor(lon, lat);

    // Take the short way round rather than unwinding a full turn
    const turns = Math.round((controls.targetRotY - r.y) / (Math.PI * 2));
    controls.targetRotY = r.y + turns * Math.PI * 2;
    controls.targetRotX = r.x;
    controls.velX = 0;
    controls.velY = 0;

    // Zoom in toward, but stay just short of, the handover distance, so a
    // focus stays on the globe rather than flipping to the flat map.
    if (zoomIn) targetCameraZ = mapSwitchZ() * 1.08;
    pauseSpin();
  }

  // Zoom button step. The React zoom-in button calls zoomStep(1) and the
  // zoom-out button calls zoomStep(-1) (see App.jsx handleGlobeZoomIn/Out),
  // the opposite sign convention from the old file's zoomStep(sign) where
  // -1 meant "in". Subtracting delta * ZOOM_STEP keeps that new contract:
  // a positive delta brings the camera closer (in), negative pushes it away.
  function zoomStep(delta) {
    if (mode !== 'globe') return;
    const maxZ = Math.max(MAX_GLOBE_Z, fitCameraZ());
    controls.zoomVel = 0;
    targetCameraZ = clamp(targetCameraZ - delta * ZOOM_STEP, MIN_GLOBE_Z, maxZ);
    pauseSpin();
  }

  function magStyle(magnitude) {
    const m = typeof magnitude === 'number' && !Number.isNaN(magnitude) ? magnitude : -Infinity;
    return MAG_COLORS.find((entry) => m >= entry.min);
  }

  // Shallow quakes sit near the shell, deep ones sink toward the core. Depth
  // is nullable (rules/geospatial.md); a missing depth is treated as 0 (shell)
  // rather than fabricated, matching the old file's `|| 0` fallback.
  function depthToRadius(depthKm) {
    const d = clamp(typeof depthKm === 'number' ? depthKm : 0, 0, DEPTH_MAX_KM);
    return GLOBE_R * (1 - (d / DEPTH_MAX_KM) * 0.7);
  }

  /* ---------- geometry builders ---------- */

  function initGlobeBase() {
    globe.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(GLOBE_R, 64, 64),
        new THREE.MeshBasicMaterial({ color: 0x1d4a63, transparent: true, opacity: 0.16, side: THREE.BackSide })
      )
    );
    globe.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(GLOBE_R - 0.8, 64, 64),
        new THREE.MeshBasicMaterial({ color: 0x122c3c, transparent: true, opacity: 0.08, side: THREE.FrontSide })
      )
    );
    globe.add(
      new THREE.LineSegments(
        new THREE.WireframeGeometry(new THREE.SphereGeometry(GLOBE_R, 36, 24)),
        new THREE.LineBasicMaterial({ color: 0x2b5c78, transparent: true, opacity: 0.15 })
      )
    );

    const gMat = new THREE.LineBasicMaterial({ color: 0x224d64, transparent: true, opacity: 0.95 });
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = [];
      for (let lon = -180; lon <= 181; lon += 4) pts.push(ll2v(lon, lat, GLOBE_R));
      globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gMat));
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const pts = [];
      for (let lat = -90; lat <= 90; lat += 3) pts.push(ll2v(lon, lat, GLOBE_R));
      globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gMat));
    }
  }

  function addCountryBoundaries(geojson) {
    const mat = new THREE.LineBasicMaterial({ color: 0xd9e6ff, transparent: true, opacity: 0.32 });
    (geojson.features || []).forEach((f) => {
      const draw = (ring) => {
        const pts = ring.map(([lon, lat]) => ll2v(lon, lat, GLOBE_R + 0.7));
        globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
      };
      const g = f.geometry;
      if (!g) return;
      if (g.type === 'Polygon') g.coordinates.forEach(draw);
      else if (g.type === 'MultiPolygon') g.coordinates.forEach((poly) => poly.forEach(draw));
    });
  }

  function getCountryName(p) {
    p = p || {};
    return p.ADMIN || p.name || p.NAME || p.NAME_EN || p.BRK_NAME || p.formal_en || p.SOVEREIGNT || '';
  }

  function ringArea(ring) {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      a += x1 * y2 - x2 * y1;
    }
    return a / 2;
  }

  function ringCentroid(ring) {
    if (!ring || ring.length < 3) return null;
    let af = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      const cr = x1 * y2 - x2 * y1;
      af += cr;
      cx += (x1 + x2) * cr;
      cy += (y1 + y2) * cr;
    }
    if (Math.abs(af) < 1e-8) {
      let sx = 0;
      let sy = 0;
      ring.forEach(([x, y]) => {
        sx += x;
        sy += y;
      });
      return [sx / ring.length, sy / ring.length];
    }
    return [cx / (3 * af), cy / (3 * af)];
  }

  function largestRing(g) {
    let best = null;
    let area = -Infinity;
    const test = (r) => {
      if (!r || r.length < 4) return;
      const a = Math.abs(ringArea(r));
      if (a > area) {
        area = a;
        best = r;
      }
    };
    if (g && g.type === 'Polygon') test(g.coordinates[0]);
    else if (g && g.type === 'MultiPolygon') g.coordinates.forEach((poly) => test(poly[0]));
    return { ring: best, area };
  }

  function buildCountryLabels(geojson) {
    labelLayer.innerHTML = '';
    countryLabels = [];
    (geojson.features || []).forEach((f) => {
      const name = getCountryName(f.properties).trim();
      if (!name) return;
      const lr = largestRing(f.geometry);
      if (!lr.ring || lr.area < 1.2) return;
      const c = ringCentroid(lr.ring);
      if (!c) return;

      const el = document.createElement('div');
      el.className = 'country-label';
      el.textContent = name;
      labelLayer.appendChild(el);

      countryLabels.push({ name, area: lr.area, el, world: ll2v(c[0], c[1], GLOBE_R + 4) });
    });
    countryLabels.sort((a, b) => b.area - a.area);
  }

  // Labels are DOM nodes projected from 3D each frame; hidden when on the
  // far side of the globe or when they would collide with a bigger country.
  function updateCountryLabels() {
    if (mode !== 'globe') {
      countryLabels.forEach((l) => {
        l.el.style.opacity = 0;
      });
      return;
    }
    const rects = [];
    const camNorm = camera.position.clone().normalize();

    countryLabels.forEach((item) => {
      const world = item.world.clone().applyQuaternion(globe.quaternion);
      if (world.clone().normalize().dot(camNorm) < 0.18) {
        item.el.style.opacity = 0;
        return;
      }

      const proj = world.clone().project(camera);
      if (proj.z < -1 || proj.z > 1) {
        item.el.style.opacity = 0;
        return;
      }

      const x = (proj.x * 0.5 + 0.5) * W;
      const y = (-proj.y * 0.5 + 0.5) * H;
      const scale = clamp((520 - camera.position.z) / 200, 0.72, 1);
      const size = Math.max(10, Math.min(15, 8 + Math.log(item.area + 1.2) * 2.1 * scale));
      item.el.style.fontSize = size.toFixed(1) + 'px';

      const w = item.el.offsetWidth || item.name.length * size * 0.62;
      const h = item.el.offsetHeight || size * 1.3;
      const rect = { left: x - w / 2, top: y - h / 2, right: x + w / 2, bottom: y + h / 2 };

      for (const r of rects) {
        if (!(rect.right < r.left || rect.left > r.right || rect.bottom < r.top || rect.top > r.bottom)) {
          item.el.style.opacity = 0;
          return;
        }
      }
      rects.push(rect);
      item.el.style.left = x + 'px';
      item.el.style.top = y + 'px';
      item.el.style.opacity = 0.95;
    });
  }

  /* ---------- plate name labels (toggled from the layer panel) ---------- */

  let plateLabels = [];
  let plateNamesVisible = false;

  // points: [{ lon, lat, name }]. Built once; toggled via setPlateNames().
  function setPlateNames(visible, points) {
    plateNamesVisible = !!visible;

    if (visible && !plateLabels.length && Array.isArray(points)) {
      points.forEach((p) => {
        if (p.lon == null || p.lat == null || !p.name) return;
        const el = document.createElement('div');
        el.className = 'plate-label';
        el.textContent = p.name;
        labelLayer.appendChild(el);
        plateLabels.push({ name: p.name, el, world: ll2v(p.lon, p.lat, GLOBE_R + 4) });
      });
    }

    if (!plateNamesVisible) plateLabels.forEach((l) => { l.el.style.opacity = 0; });
  }

  // Projected each frame, like the country labels, but no collision culling,
  // there are only ~50 and hiding some would look arbitrary.
  function updatePlateLabels() {
    if (!plateLabels.length) return;
    if (!plateNamesVisible || mode !== 'globe') {
      plateLabels.forEach((l) => { l.el.style.opacity = 0; });
      return;
    }
    const camNorm = camera.position.clone().normalize();

    plateLabels.forEach((item) => {
      const world = item.world.clone().applyQuaternion(globe.quaternion);
      if (world.clone().normalize().dot(camNorm) < 0.15) {
        item.el.style.opacity = 0;
        return;
      }

      const proj = world.clone().project(camera);
      if (proj.z < -1 || proj.z > 1) {
        item.el.style.opacity = 0;
        return;
      }

      item.el.style.left = (proj.x * 0.5 + 0.5) * W + 'px';
      item.el.style.top = (-proj.y * 0.5 + 0.5) * H + 'px';
      item.el.style.opacity = 1;
    });
  }

  // Builds the point cloud from normalized quake objects:
  // { id, coordinates: [lon, lat], magnitude, depthKm, place, occurredAt }.
  // The old file read GeoJSON `feature.properties.mag` and the z-coordinate
  // for depth; this reads `magnitude` / `depthKm` directly, both nullable.
  function buildEarthquakePoints(list) {
    if (ptMesh) {
      globe.remove(ptMesh);
      ptMesh.geometry.dispose();
      ptMesh.material.dispose();
      ptMesh = null;
    }

    quakes = (Array.isArray(list) ? list : []).filter(
      (q) => q && Array.isArray(q.coordinates) && q.coordinates.length >= 2
    );
    if (!quakes.length) return;

    const pos = [];
    const col = [];
    const size = [];
    quakes.forEach((q) => {
      const [lon, lat] = q.coordinates;
      if (lon == null || lat == null || Number.isNaN(lon) || Number.isNaN(lat)) return;
      const style = magStyle(q.magnitude);
      const v = ll2v(lon, lat, depthToRadius(q.depthKm));
      pos.push(v.x, v.y, v.z);
      col.push(style.rgb[0] / 255, style.rgb[1] / 255, style.rgb[2] / 255);
      size.push(style.size);
    });

    const disc = document.createElement('canvas');
    disc.width = disc.height = 64;
    const dctx = disc.getContext('2d');
    dctx.beginPath();
    dctx.arc(32, 32, 28, 0, Math.PI * 2);
    dctx.fillStyle = '#fff';
    dctx.fill();

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: new THREE.CanvasTexture(disc) } },
      vertexShader:
        'attribute vec3 aColor;attribute float aSize;varying vec3 vCol;' +
        'void main(){vCol=aColor;vec4 mv=modelViewMatrix*vec4(position,1.0);' +
        'gl_PointSize=aSize*(300.0/-mv.z);gl_Position=projectionMatrix*mv;}',
      fragmentShader:
        'uniform sampler2D uTex;varying vec3 vCol;' +
        'void main(){float a=texture2D(uTex,gl_PointCoord).r;if(a<0.5)discard;gl_FragColor=vec4(vCol,1.0);}',
      transparent: false,
      depthTest: true,
      depthWrite: true
    });

    ptMesh = new THREE.Points(geo, mat);
    globe.add(ptMesh);
  }

  /* ---------- fault / tectonic overlays ---------- */

  // Flattens one feature's geometry into gl_LINES vertex pairs
  function featureVerts(feature) {
    const verts = [];
    const pushLine = (coords) => {
      for (let i = 0; i < coords.length - 1; i++) {
        const a = coords[i];
        const b = coords[i + 1];
        if (!a || !b) continue;
        const va = ll2v(a[0], a[1], GLOBE_R + 1.2);
        const vb = ll2v(b[0], b[1], GLOBE_R + 1.2);
        verts.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
      }
    };

    const g = feature.geometry;
    if (!g) return verts;
    if (g.type === 'LineString') pushLine(g.coordinates);
    else if (g.type === 'MultiLineString') g.coordinates.forEach(pushLine);
    else if (g.type === 'Polygon') g.coordinates.forEach(pushLine);
    else if (g.type === 'MultiPolygon') g.coordinates.forEach((poly) => poly.forEach(pushLine));
    return verts;
  }

  // NOTE: WebGL ignores LineBasicMaterial.linewidth on most browsers (lines are
  // always 1px), so `linewidth` here is best-effort, same caveat as the old file.
  function segmentsFrom(verts, cfg) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    return new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: cfg.color, transparent: true, opacity: cfg.opacity, linewidth: cfg.linewidth || 1 })
    );
  }

  // A named overlay becomes a Group holding one LineSegments per feature, so a
  // raycast hit carries its own name. Unnamed overlays are merged into a single
  // draw call.
  function buildOverlayObject(geojson, cfg) {
    const featureList = geojson.features || [];

    if (!cfg.nameProp) {
      const all = [];
      featureList.forEach((f) => { all.push(...featureVerts(f)); });
      return segmentsFrom(all, cfg);
    }

    const group = new THREE.Group();
    featureList.forEach((f) => {
      const verts = featureVerts(f);
      if (!verts.length) return;
      const seg = segmentsFrom(verts, cfg);
      seg.userData.name = (f.properties || {})[cfg.nameProp] || '';
      group.add(seg);
    });
    return group;
  }

  /*
   * Loads a named GeoJSON dataset for an overlay or the plate-name points.
   *
   * The old portal loaded these from local data/<key>.js files injected as
   * classic <script> tags (dataLoader.js), a mechanism specific to that
   * static build and not present in this client. This is a best-effort port:
   * it looks for the same dataset as a static JSON asset (data/<key>.json)
   * and fails soft (logs, resolves to an empty FeatureCollection) so a
   * missing dataset never breaks the globe or its earthquake points.
   */
  function loadEQData(key) {
    return fetch(`/data/${key}.json`, { cache: 'force-cache' })
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .catch((err) => {
        console.warn('createGlobe: overlay dataset unavailable', key, err);
        return { type: 'FeatureCollection', features: [] };
      });
  }

  // Overlays load lazily; a large fault dataset is only pulled in once toggled on.
  function setOverlay(layerId, visible) {
    const cfg = OVERLAYS[layerId];
    if (!cfg) return;

    if (overlayObjects[layerId]) {
      overlayObjects[layerId].visible = !!visible;
      if (!visible) hidePopup();
      return;
    }
    if (!visible || overlayLoading[layerId]) return;

    overlayLoading[layerId] = loadEQData(cfg.key)
      .then((gj) => {
        const obj = buildOverlayObject(gj, cfg);
        obj.visible = true;
        overlayObjects[layerId] = obj;
        globe.add(obj);
      })
      .catch((err) => console.error('createGlobe: overlay build failed', layerId, err))
      .finally(() => { delete overlayLoading[layerId]; });
  }

  /* ---------- alert pulse ---------- */

  function clearPulse() {
    if (!pulseGroup) return;
    globe.remove(pulseGroup);
    pulseGroup.children.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
    pulseGroup = null;
  }

  // Three tangent rings expanding outward from the epicentre, looping forever
  // until the next earthquake replaces them (mirrors the Mapbox pulse).
  function pulse(lon, lat) {
    clearPulse();
    if (lon == null || lat == null) return;

    pulseGroup = new THREE.Group();
    const surface = ll2v(lon, lat, GLOBE_R + 1.5);

    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.78, 1, 64),
        new THREE.MeshBasicMaterial({
          color: PULSE_COLOR_HEX,
          transparent: true,
          opacity: PULSE_MAX_OPACITY,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      mesh.position.copy(surface);
      mesh.lookAt(surface.clone().multiplyScalar(2));
      mesh.userData.phase = i / 3;
      pulseGroup.add(mesh);
    }
    globe.add(pulseGroup);
  }

  function updatePulse() {
    if (!pulseGroup) return;
    const t = performance.now() / 1000;
    const maxScale = 26;
    pulseGroup.children.forEach((mesh) => {
      const p = (t / 2.4 + mesh.userData.phase) % 1;
      const s = Math.max(0.001, p * maxScale);
      mesh.scale.set(s, s, s);
      mesh.material.opacity = (1 - p) * PULSE_MAX_OPACITY;
    });
  }

  /* ---------- "last 24 hours" pulse ---------- */

  const PULSE_24H_RINGS_PER_POINT = 6;
  const PULSE_24H_MAX_SCALE = 44; // bigger than the single-event pulse (26)

  function clearPulse24h() {
    if (!pulse24hGroup) return;
    globe.remove(pulse24hGroup);
    pulse24hGroup.children.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
    pulse24hGroup = null;
  }

  function pulse24h(points) {
    clearPulse24h();
    if (!points || !points.length) return;

    pulse24hGroup = new THREE.Group();
    points.forEach((coords) => {
      const [lon, lat] = coords || [];
      if (lon == null || lat == null) return;

      const surface = ll2v(lon, lat, GLOBE_R + 1.5);

      // Bright yellow-white core glow at the epicentre, static, so it is
      // tagged isCore and skipped by the expanding-ring animation below.
      const core = new THREE.Mesh(
        new THREE.CircleGeometry(PULSE_24H_CORE_RADIUS, 24),
        new THREE.MeshBasicMaterial({
          color: PULSE_24H_CORE_COLOR_HEX,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      core.position.copy(surface);
      core.lookAt(surface.clone().multiplyScalar(2));
      core.userData.isCore = true;
      pulse24hGroup.add(core);

      for (let i = 0; i < PULSE_24H_RINGS_PER_POINT; i++) {
        const mesh = new THREE.Mesh(
          new THREE.RingGeometry(0.9, 1, 48),
          new THREE.MeshBasicMaterial({
            color: PULSE_24H_STROKE_COLOR_HEX,
            transparent: true,
            opacity: PULSE_24H_MAX_OPACITY,
            side: THREE.DoubleSide,
            depthWrite: false
          })
        );
        mesh.position.copy(surface);
        mesh.lookAt(surface.clone().multiplyScalar(2));
        mesh.userData.phase = i / PULSE_24H_RINGS_PER_POINT;
        pulse24hGroup.add(mesh);
      }
    });
    globe.add(pulse24hGroup);
  }

  function updatePulse24h() {
    if (!pulse24hGroup) return;
    const t = performance.now() / 1000;
    pulse24hGroup.children.forEach((mesh) => {
      if (mesh.userData.isCore) return; // the epicentre core stays put
      const p = (t / 2.4 + mesh.userData.phase) % 1;
      const s = Math.max(0.001, p * PULSE_24H_MAX_SCALE);
      mesh.scale.set(s, s, s);
      mesh.material.opacity = Math.sqrt(1 - p) * PULSE_24H_MAX_OPACITY;
    });
  }

  /* ---------- mode switching ---------- */

  /*
   * Hand over to the flat map, centred on whatever point of the globe is
   * facing the camera. This is the automatic zoom-in handover; the flat map
   * itself (MapView.jsx) owns every other interaction with it.
   */
  function enterMapMode() {
    const dest = getFrontCenterLonLat();

    if (mode !== 'map') {
      mode = 'map';
      canvas.style.display = 'none';
      labelLayer.style.display = 'none';
      tooltip.style.display = 'none';
      hidePopup();
      stage.classList.add('flat-mode');
      map.resize();
    }

    // easeTo, not flyTo: flyTo's curve zooms far out then back in when the
    // destination is distant, which reads as "it zoomed out to the globe" and
    // makes the handover feel slow. easeTo interpolates directly.
    map.easeTo({ center: [dest.lon, dest.lat], zoom: 4, duration: 500, essential: true });
  }

  function exitMapMode() {
    if (mode === 'globe') return;
    mode = 'globe';

    const c = map.getCenter();
    setGlobeToLonLat(c.lng, c.lat);

    canvas.style.display = 'block';
    labelLayer.style.display = 'block';
    stage.classList.remove('flat-mode');

    // Come back to the same framing the globe starts at.
    targetCameraZ = fitCameraZ();
    camera.position.z = targetCameraZ;
    updateCountryLabels();
  }

  /* ---------- hollow-globe activation ----------
   *
   * The app opens on the Mapbox globe projection. Activating the hollow globe
   * hands the stage to the Three.js canvas and flips Mapbox to 'mercator', so
   * its flat map is ready to receive the zoom-in depth handover. Deactivating
   * hides the canvas and returns Mapbox to the globe projection.
   *
   * React (via `hollowActive` state) owns the `.hollow-active` class on
   * #map-stage; this module only manages `.flat-mode` (used purely to hide
   * the zoom controls once the flat map has taken over, see index.css).
   */
  function activateHollowGlobe() {
    if (active) return;
    active = true;
    mode = 'globe';

    map.setProjection('mercator');

    canvas.style.display = 'block';
    labelLayer.style.display = 'block';
    stage.classList.remove('flat-mode');

    // Face the point the Mapbox globe was centred on, then frame the whole globe.
    const c = map.getCenter();
    setGlobeToLonLat(c.lng, c.lat);
    targetCameraZ = fitCameraZ();
    camera.position.z = targetCameraZ;
    resize();
    notifyHollowChange(active);
  }

  function deactivateHollowGlobe() {
    if (!active) return;
    active = false;
    mode = 'globe';

    canvas.style.display = 'none';
    labelLayer.style.display = 'none';
    tooltip.style.display = 'none';
    hidePopup();
    stage.classList.remove('flat-mode');

    // Back to the Mapbox globe. If the flat map had been zoomed in, pull back
    // out so the globe is actually visible again.
    map.setProjection('globe');
    map.resize();
    if (map.getZoom() > 4) map.easeTo({ zoom: 2, duration: 600, essential: true });
    notifyHollowChange(active);
  }

  /* ---------- interaction ---------- */

  function onPointerDown(e) {
    if (mode !== 'globe') return;
    isDragging = true;
    pauseSpin();
    pressX = e.clientX;
    pressY = e.clientY;
    dragMoved = false;
    lastX = e.clientX;
    lastY = e.clientY;
    lastMoveTime = performance.now();
    controls.velX = 0;
    controls.velY = 0;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  }

  function onPointerMove(e) {
    if (mode !== 'globe') return;
    const rect = canvas.getBoundingClientRect();
    mouse.set(((e.clientX - rect.left) / W) * 2 - 1, -((e.clientY - rect.top) / H) * 2 + 1);

    if (isDragging) {
      if (Math.abs(e.clientX - pressX) > 4 || Math.abs(e.clientY - pressY) > 4) dragMoved = true;

      const now = performance.now();
      const dt = Math.max(16, now - lastMoveTime);
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      const sensitivity = 0.0052 * (camera.position.z / 430);

      controls.targetRotY += dx * sensitivity;
      controls.targetRotX = clamp(controls.targetRotX + dy * sensitivity, -MAX_TILT, MAX_TILT);
      controls.velY = (dx * sensitivity) / (dt / 16.67);
      controls.velX = (dy * sensitivity) / (dt / 16.67);

      lastX = e.clientX;
      lastY = e.clientY;
      lastMoveTime = now;
      tooltip.style.display = 'none';
      return;
    }

    if (!ptMesh) return;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(ptMesh);
    if (!hits.length) {
      tooltip.style.display = 'none';
      return;
    }

    const q = quakes[hits[0].index];
    if (!q) return;

    const mag = typeof q.magnitude === 'number' ? q.magnitude.toFixed(1) : 'Unknown';
    const depth = typeof q.depthKm === 'number' ? Math.round(q.depthKm) : null;
    const occurred = q.occurredAt ? new Date(q.occurredAt).toLocaleString() : 'Unknown time';
    tooltip.innerHTML =
      `<strong>Magnitude: ${mag}</strong><br>` +
      `${q.place || 'Unknown'}<br>` +
      `Depth: ${depth !== null ? depth + ' km' : 'Unknown'}<br>` +
      `${occurred}`;

    let tx = e.clientX - rect.left + 16;
    const ty = e.clientY - rect.top - 18;
    if (tx + 220 > W) tx = e.clientX - rect.left - 226;
    tooltip.style.left = tx + 'px';
    tooltip.style.top = Math.max(ty, 5) + 'px';
    tooltip.style.display = 'block';
  }

  function onPointerUp(e) {
    if (mode !== 'globe') return;
    isDragging = false;
    pauseSpin();
    if (canvas.releasePointerCapture) canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = 'grab';
  }

  function resize() {
    const previousFit = fitCameraZ();

    W = stage.clientWidth || 1;
    H = stage.clientHeight || 1;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);

    // A reshaped panel changes the distance at which the globe fits. Follow it,
    // but only while the camera is still where we put it, once the user has
    // zoomed, that is their framing to keep.
    if (Math.abs(targetCameraZ - previousFit) < 1) {
      targetCameraZ = fitCameraZ();
      camera.position.z = targetCameraZ;
    }
  }

  function bindEvents() {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('click', (e) => {
      if (mode !== 'globe' || dragMoved) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const name = pickOverlay(e.clientX, e.clientY);
      if (name) showPopup(name, x, y);
      else hidePopup();
    });
    canvas.addEventListener('mouseleave', () => {
      isDragging = false;
      tooltip.style.display = 'none';
      canvas.style.cursor = 'grab';
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (mode !== 'globe') return;
        e.preventDefault();
        pauseSpin();
        controls.zoomVel = clamp(controls.zoomVel + e.deltaY * 0.045, -60, 60);
      },
      { passive: false }
    );

    // No listeners here for the globe-mode / zoom buttons: those are React
    // elements now (see MapStage.jsx) and call setHollowGlobe()/zoomStep()
    // directly through the object this factory returns.

    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
    window.addEventListener('resize', resize);

    map.on('zoomend', () => {
      // Only the hollow globe hands back to itself; the default Mapbox globe
      // owns its own zoom-out (see installGlobeSpin in MapView.jsx).
      if (active && mode === 'map' && map.getZoom() <= MAP_EXIT_ZOOM) exitMapMode();
    });
  }

  function updateSmoothControls() {
    if (mode !== 'globe') return;

    if (!isDragging) {
      controls.targetRotX = clamp(controls.targetRotX + controls.velX, -MAX_TILT, MAX_TILT);
      controls.targetRotY += controls.velY;
      controls.velX *= controls.damping;
      controls.velY *= controls.damping;
      if (Math.abs(controls.velX) < 0.00001) controls.velX = 0;
      if (Math.abs(controls.velY) < 0.00001) controls.velY = 0;
      if (performance.now() >= spinPausedUntil) controls.targetRotY += 0.001;
    }

    if (Math.abs(controls.zoomVel) > 0.001) {
      // On a narrow panel the fit distance can exceed MAX_GLOBE_Z; never clamp
      // the user back in closer than the distance the globe starts at.
      const maxZ = Math.max(MAX_GLOBE_Z, fitCameraZ());
      targetCameraZ = clamp(targetCameraZ + controls.zoomVel, MIN_GLOBE_Z, maxZ);
      controls.zoomVel *= 0.78;
    }

    globe.rotation.x = lerp(globe.rotation.x, controls.targetRotX, controls.rotateEase);
    globe.rotation.y = lerp(globe.rotation.y, controls.targetRotY, controls.rotateEase);
    camera.position.z = lerp(camera.position.z, targetCameraZ, controls.zoomEase);

    // Hand over as soon as the VISIBLE camera crosses the threshold, rather than
    // waiting for the eased position to also arrive.
    if (camera.position.z <= mapSwitchZ()) enterMapMode();
  }

  function animate() {
    requestAnimationFrame(animate);
    if (!active) return; // dormant while the Mapbox globe is the active view
    updateSmoothControls();
    if (mode === 'globe') {
      updatePulse();
      updatePulse24h();
      updateCountryLabels();
      updatePlateLabels();
      renderer.render(scene, camera);
    }
  }

  /* ---------- public API ---------- */

  const api = {
    setEarthquakes: buildEarthquakePoints,
    setOverlay,
    pulse,
    clearPulse,
    pulse24h,
    clearPulse24h,
    focusOn,
    zoomStep,
    setPlateNames,
    setHollowGlobe: (on) => (on ? activateHollowGlobe() : deactivateHollowGlobe()),
    isHollowActive: () => active
  };

  initGlobeBase();
  resize();
  canvas.style.cursor = 'grab';
  bindEvents();
  animate();

  // Country outlines and labels come from a remote dataset; the globe is
  // usable (and points still render) even if this fetch fails.
  (async function loadCountries() {
    for (const url of COUNTRY_URLS) {
      try {
        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const gj = await res.json();
        addCountryBoundaries(gj);
        buildCountryLabels(gj);
        return;
      } catch (err) {
        console.warn('createGlobe: country data failed', url, err);
      }
    }
    console.error('createGlobe: no country dataset could be loaded');
  })();

  return api;
}
