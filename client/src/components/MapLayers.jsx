import { Source, Layer } from 'react-map-gl/mapbox';
import { EQ_CIRCLE_PAINT, EQ_LABEL_LAYOUT, EQ_LABEL_PAINT } from '../config.js';
import {
  buildVectorTileUrl,
  vectorLayerGeometryKind,
  vectorLayerHasArrows,
  layerStyleToPaint
} from '../utils/vectorLayers.js';

// Directional-arrow symbol layout for fault lines, repeated along the line and
// rotated to follow its direction. icon-image is set per layer from the line
// color (see makeArrowImageData). Shared so the main map and the compare
// overlay draw identical layers.
const ARROW_LAYOUT_BASE = {
  'symbol-placement': 'line',
  'symbol-spacing': 70,
  'icon-size': 0.9,
  'icon-anchor': 'bottom',
  'icon-rotation-alignment': 'map',
  'icon-allow-overlap': true,
  'icon-ignore-placement': true,
  'icon-keep-upright': false
};

// A small filled triangle (subduction-teeth) colored to match the line, keyed
// by color so a recolor loads a fresh image on demand (styleimagemissing).
export function makeArrowImageData(color) {
  const s = 18;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(9, 3);
  ctx.lineTo(2, 16);
  ctx.lineTo(16, 16);
  ctx.closePath();
  ctx.fill();
  return ctx.getImageData(0, 0, s, s);
}

export const arrowImageId = (color) => `arrow-${color}`;

// A small upward-pointing filled triangle centered in the tile, for point
// marker layers (e.g. historical tsunamis). Keyed by color for recolor.
export function makeTriangleImageData(color) {
  const s = 16;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.moveTo(s / 2, 2);
  ctx.lineTo(s - 2, s - 3);
  ctx.lineTo(2, s - 3);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.stroke();
  return ctx.getImageData(0, 0, s, s);
}

export const triangleImageId = (color) => `tri-${color}`;

// Generates whichever on-demand vector icon a 'styleimagemissing' event asks
// for (fault arrows or marker triangles). Shared by the main map and the
// compare overlay so both can draw these layers.
export function addMissingVectorImage(map, id) {
  if (typeof id !== 'string' || map.hasImage(id)) return;
  if (id.startsWith('arrow-')) map.addImage(id, makeArrowImageData(id.slice('arrow-'.length)));
  else if (id.startsWith('tri-')) map.addImage(id, makeTriangleImageData(id.slice('tri-'.length)));
}

// Renders the raster overlays, vector layers (fill/line/arrow/label), and the
// quake circles + magnitude labels for a map. Pure display; interactivity
// (popups, click, reorder) stays in the owning map component. Used by both
// MapView (the main map) and PgaCompare (the swipe overlay) so the two sides
// of the comparison show the same layers.
export default function MapLayers({ quakesGeoJSON, vectorLayers, rasterLayers }) {
  const visibleVectorLayers = (vectorLayers || []).filter((layer) => layer.visible);
  const visibleRasters = (rasterLayers || []).filter((raster) => raster.visible && raster.tileUrl);

  return (
    <>
      {visibleRasters.map((raster) => (
        <Source
          key={`${raster.name}-${raster.tileUrl}`}
          id={`raster-src-${raster.name}`}
          type="raster"
          tiles={[raster.tileUrl]}
          tileSize={256}
        >
          <Layer id={`raster-layer-${raster.name}`} type="raster" paint={{ 'raster-opacity': raster.opacity }} />
        </Source>
      ))}

      {visibleVectorLayers.map((layer) => {
        const kind = vectorLayerGeometryKind(layer.name);
        const paint = layerStyleToPaint(layer.name, layer.style);
        return (
          <Source
            key={layer.name}
            id={`vector-src-${layer.name}`}
            type="vector"
            tiles={[buildVectorTileUrl(layer.name)]}
          >
            {kind === 'polygon' && (
              <Layer id={`vector-fill-${layer.name}`} source-layer={layer.name} type="fill" paint={paint.fillPaint} />
            )}
            {kind === 'polygon' && (
              <Layer id={`vector-line-${layer.name}`} source-layer={layer.name} type="line" paint={paint.linePaint} />
            )}
            {kind === 'line' && (
              <Layer id={`vector-line-${layer.name}`} source-layer={layer.name} type="line" paint={paint.linePaint} />
            )}
            {kind === 'line' && vectorLayerHasArrows(layer.name) && (
              <Layer
                id={`vector-linearrow-${layer.name}`}
                source-layer={layer.name}
                type="symbol"
                minzoom={3}
                layout={{ ...ARROW_LAYOUT_BASE, 'icon-image': arrowImageId(layer.style?.color || '#e01e1e') }}
              />
            )}
            {kind === 'point' && (
              <Layer
                id={`vector-circle-${layer.name}`}
                source-layer={layer.name}
                type="symbol"
                layout={{
                  'text-field': ['coalesce', ['get', 'names'], ['get', 'Names'], ['get', 'name'], ['get', 'Name'], ''],
                  'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                  'text-size': 12,
                  'text-anchor': 'center'
                }}
                paint={{
                  'text-color': layer.style?.color || '#ffd23f',
                  'text-halo-color': '#000000',
                  'text-halo-width': 1.2
                }}
              />
            )}
            {kind === 'marker' && (
              <Layer
                id={`vector-circle-${layer.name}`}
                source-layer={layer.name}
                type="symbol"
                layout={{
                  'icon-image': triangleImageId(layer.style?.color || '#1e90ff'),
                  'icon-size': 0.7,
                  'icon-allow-overlap': true,
                  'icon-ignore-placement': true
                }}
              />
            )}
          </Source>
        );
      })}

      <Source id="quakes" type="geojson" data={quakesGeoJSON}>
        <Layer id="quakes-points" type="circle" paint={EQ_CIRCLE_PAINT} />
        <Layer id="quakes-labels" type="symbol" layout={EQ_LABEL_LAYOUT} paint={EQ_LABEL_PAINT} />
      </Source>
    </>
  );
}
