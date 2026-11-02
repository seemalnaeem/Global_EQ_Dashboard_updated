import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuX } from 'react-icons/lu';
import { COLORMAPS, colormapRampCss } from '../utils/rasterTiles.js';

// Live-style popover for a single raster hazard overlay: colormap ramp picker,
// opacity, and rescale min/max. Purely controlled; all edits flow up through
// onChange. Mirrors LayerStylePopover's portal + anchored-positioning mechanics
// so it floats over the map outside the drawer.
export default function RasterStylePopover({ anchorEl, title, state, min, max, hazard, onChange, onClose }) {
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    function place() {
      if (!anchorEl) return;
      const a = anchorEl.getBoundingClientRect();
      const el = popRef.current;
      const w = el?.offsetWidth || 260;
      const h = el?.offsetHeight || 220;
      const gap = 8;
      let left = a.right + gap;
      if (left + w > window.innerWidth - gap) {
        left = Math.max(gap, a.left - w - gap);
      }
      let top = a.top;
      if (top + h > window.innerHeight - gap) {
        top = Math.max(gap, window.innerHeight - h - gap);
      }
      setPos({ top, left });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorEl]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    function onDown(e) {
      if (popRef.current && !popRef.current.contains(e.target) && anchorEl && !anchorEl.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [anchorEl, onClose]);

  const body = (
    <div
      ref={popRef}
      className="layer-style-popover raster-style-popover"
      role="dialog"
      aria-label={`${title} style`}
      style={{
        position: 'fixed',
        top: pos ? pos.top : -9999,
        left: pos ? pos.left : -9999,
        visibility: pos ? 'visible' : 'hidden'
      }}
    >
      <div className="layer-style-header">
        <div className="layer-style-title">{title}</div>
        <button type="button" className="icon-button-plain" onClick={onClose} aria-label={`Close ${title} style panel`}>
          <LuX size={14} />
        </button>
      </div>

      {!hazard && (
        <>
          <div className="layer-style-row raster-style-row">
            <span className="layer-style-label">Ramp</span>
          </div>
          <div className="ramp-swatches">
            {COLORMAPS.map((name) => (
              <button
                key={name}
                type="button"
                className={`ramp-swatch${state.colormap === name ? ' active' : ''}`}
                style={{ background: colormapRampCss(name) }}
                onClick={() => onChange({ colormap: name })}
                aria-label={`Set colormap ${name}`}
                aria-pressed={state.colormap === name}
                title={name}
              />
            ))}
          </div>
        </>
      )}

      <div className="layer-style-row">
        <span className="layer-style-label">Opacity</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.opacity}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          aria-label={`${title} opacity`}
        />
        <span className="layer-style-value">{Math.round(state.opacity * 100)}%</span>
      </div>

      {!hazard && (
        <>
          <div className="layer-style-row">
            <span className="layer-style-label">Min</span>
            <input
              type="number"
              value={state.rescaleMin}
              min={min}
              max={max}
              onChange={(e) => onChange({ rescaleMin: Number(e.target.value) })}
              aria-label={`${title} rescale minimum`}
            />
          </div>
          <div className="layer-style-row">
            <span className="layer-style-label">Max</span>
            <input
              type="number"
              value={state.rescaleMax}
              min={min}
              max={max}
              onChange={(e) => onChange({ rescaleMax: Number(e.target.value) })}
              aria-label={`${title} rescale maximum`}
            />
          </div>
        </>
      )}
    </div>
  );

  return createPortal(body, document.body);
}
