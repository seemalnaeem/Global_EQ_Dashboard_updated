---
name: react-map
description: Build the interactive earthquake map and layers in React with Mapbox GL. Use for the map, markers, vector layers, raster overlays, and filters.
---

# React Earthquake Map (Mapbox GL)

## Setup
`mapbox-gl` + `react-map-gl`. Token from `import.meta.env.VITE_MAPBOX_TOKEN`. If
it is missing, render the overlays on a plain background and show a small notice.
GeoJSON is `[lon, lat]`, which is Mapbox native, so no coordinate swap.

## Layers
- Quakes: circle layer colored by the fixed magnitude scale (rules/geospatial.md),
  radius by magnitude. Cluster above ~1000 points.
- Vectors: served as Mapbox Vector Tiles from `/api/tiles/:layer/{z}/{x}/{y}.pbf`
  (ST_AsMVT). Add a `type: "vector"` source and set each layer's `source-layer`
  to the layer name. Lines for faults and boundaries, circle for points. Do not
  fetch whole-layer GeoJSON for rendering; tiles load per viewport.
- Vector tile URLs must be ABSOLUTE, anchored to `window.location.origin`. Mapbox
  parses vector tiles in a Web Worker where a relative path resolves against the
  worker blob and returns the HTML fallback ("failed to parse"). Origin-anchored
  stays IP-independent. Raster image tiles load main-thread, so relative is fine.
- Raster hazard overlays: a raster source whose tiles come from TiTiler (see
  skills/raster-tiles). Add a color-ramp control (colormap + rescale) that
  rebuilds the tile URL. Add an opacity slider.

## Data flow
- Typed hooks in `client/src/api/`, no inline fetch.
- WebSocket hook appends live quakes; dedupe by `source_id`.
- Filters (magnitude, depth, time, bbox) drive query params, debounced.

## States (all required)
Loading, empty ("no quakes match"), and error with retry. Handle null magnitude
and depth in popups and legends.

## Performance
- Let Mapbox GL do the rendering. Update sources with `setData`, do not recreate
  layers on every pan. Memoize layer definitions.

## Test
Vitest on the magnitude color/radius mapping, filter-to-query mapping, and the
TiTiler URL builder (colormap and rescale params).
