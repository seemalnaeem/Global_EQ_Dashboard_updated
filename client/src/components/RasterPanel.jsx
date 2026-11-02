import { useState } from 'react';
import { LuEye, LuEyeOff } from 'react-icons/lu';
import { colormapRampCss } from '../utils/rasterTiles.js';
import { RASTER_HAZARD, hazardGradientCss } from '../config.js';
import RasterStylePopover from './RasterStylePopover.jsx';

// Toggle + style panel for raster hazard overlays from /api/rasters. Each row
// mirrors a LayerPanel row: an eye toggle plus a gradient ramp swatch that
// opens a RasterStylePopover (colormap, opacity, rescale). Any change rebuilds
// the TiTiler tile URL client-side; it never re-fetches the COG.
export default function RasterPanel({ catalog, catalogLoading, catalogError, controls, onChange }) {
  const [openStyleFor, setOpenStyleFor] = useState(null);
  const [styleAnchor, setStyleAnchor] = useState(null);

  function closeStyle() {
    setOpenStyleFor(null);
    setStyleAnchor(null);
  }

  if (catalogLoading) return <p className="panel-hint">Loading rasters...</p>;
  if (catalogError) return <p className="panel-hint error">Rasters unavailable: {catalogError}</p>;
  if (catalog.length === 0) return <p className="panel-hint">No raster overlays available.</p>;

  return (
    <ul className="layer-list raster-list">
      {catalog.map((entry) => {
        const state = controls[entry.name];
        if (!state) return null;
        const hazard = RASTER_HAZARD[entry.name];
        const title = hazard?.title || entry.title || entry.name;
        const swatchBg = hazard ? hazardGradientCss(hazard) : colormapRampCss(state.colormap);
        const isOpen = openStyleFor === entry.name;
        return (
          <li className="layer-item raster-item" key={entry.name}>
            <div className="layer-item-row">
              <button
                type="button"
                className="layer-row"
                onClick={() => onChange(entry.name, { visible: !state.visible })}
                aria-pressed={state.visible}
              >
                <span className="layer-row-label">{title}</span>
                {state.visible ? (
                  <LuEye size={14} aria-hidden="true" />
                ) : (
                  <LuEyeOff size={14} aria-hidden="true" className="muted" />
                )}
              </button>
              <button
                type="button"
                className="layer-style-trigger"
                onClick={(e) => {
                  if (isOpen) {
                    closeStyle();
                  } else {
                    setOpenStyleFor(entry.name);
                    setStyleAnchor(e.currentTarget);
                  }
                }}
                aria-label={`Style ${title}`}
                aria-expanded={isOpen}
              >
                <span className="raster-style-swatch" style={{ backgroundImage: swatchBg }} />
              </button>
            </div>
            {isOpen && (
              <RasterStylePopover
                anchorEl={styleAnchor}
                title={title}
                state={state}
                min={entry.min}
                max={entry.max}
                hazard={!!hazard}
                onChange={(patch) => onChange(entry.name, patch)}
                onClose={closeStyle}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
