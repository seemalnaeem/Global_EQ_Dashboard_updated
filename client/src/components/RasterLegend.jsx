import { colormapRampCss } from '../utils/rasterTiles.js';

function fmt(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '';
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

// Bottom-left stack of legends for the currently visible raster overlays.
// Categorical hazard rasters show their fixed class list (swatch + label);
// any other raster falls back to a colormap ramp with low/high bounds. Hidden
// when no raster is on.
export default function RasterLegend({ legends }) {
  if (!legends || legends.length === 0) return null;
  return (
    <div id="raster-legend-stack">
      {legends.map((legend) => (
        <div className="raster-legend" key={legend.name}>
          <div className="raster-legend-title">{legend.title}</div>
          {legend.classes ? (
            legend.classes.map((cls) => (
              <div className="raster-legend-row" key={cls.label}>
                <span className="raster-legend-swatch" style={{ background: cls.color }} />
                <span>{cls.label}</span>
              </div>
            ))
          ) : (
            <>
              <div className="raster-legend-ramp" style={{ backgroundImage: colormapRampCss(legend.colormap) }} />
              <div className="raster-legend-scale">
                <span>{fmt(legend.min)}</span>
                <span>{fmt(legend.max)}</span>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
