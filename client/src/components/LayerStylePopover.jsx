import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuX } from 'react-icons/lu';
import { PRESET_COLORS, vectorLayerGeometryKind } from '../utils/vectorLayers.js';

// Live-style popover for a single vector layer row: color presets + custom
// color, outline width, and (polygons only) fill opacity. Purely controlled:
// all edits flow up through onChange, no local style state here.
//
// Rendered through a portal with fixed positioning anchored to the row's swatch
// (anchorEl), so it floats over the map outside the sidebar. That keeps it from
// pushing the layer rows below it down and from being clipped by the sidebar's
// overflow. Flips to the left of the swatch when there is no room on the right.
export default function LayerStylePopover({
  anchorEl,
  name,
  label,
  featureCount,
  style,
  onChange,
  onClose
}) {
  const safeStyle = style || { color: '#8b949e', outlineWidth: 1, fillOpacity: 0.1 };
  const isPolygon = vectorLayerGeometryKind(name) === 'polygon';
  const hasCount = typeof featureCount === 'number';

  const popRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    function place() {
      if (!anchorEl) return;
      const a = anchorEl.getBoundingClientRect();
      const el = popRef.current;
      const w = el?.offsetWidth || 240;
      const h = el?.offsetHeight || 220;
      const gap = 8;
      let left = a.right + gap; // to the right of the swatch, over the map
      if (left + w > window.innerWidth - gap) {
        left = Math.max(gap, a.left - w - gap); // flip left if it would overflow
      }
      let top = a.top;
      if (top + h > window.innerHeight - gap) {
        top = Math.max(gap, window.innerHeight - h - gap);
      }
      setPos({ top, left });
    }
    place();
    window.addEventListener('resize', place);
    // capture-phase so scrolling the sidebar list repositions the popover
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
      if (
        popRef.current &&
        !popRef.current.contains(e.target) &&
        anchorEl &&
        !anchorEl.contains(e.target)
      ) {
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
      className="layer-style-popover"
      role="dialog"
      aria-label={`${label} style`}
      style={{
        position: 'fixed',
        top: pos ? pos.top : -9999,
        left: pos ? pos.left : -9999,
        visibility: pos ? 'visible' : 'hidden'
      }}
    >
      <div className="layer-style-header">
        <div>
          <div className="layer-style-title">{label}</div>
          {hasCount && (
            <div className="layer-style-count">
              {featureCount.toLocaleString('en-US')} feature{featureCount === 1 ? '' : 's'}
            </div>
          )}
        </div>
        <button
          type="button"
          className="icon-button-plain"
          onClick={onClose}
          aria-label={`Close ${label} style panel`}
        >
          <LuX size={14} />
        </button>
      </div>

      <div className="layer-style-row">
        <span className="layer-style-label">Colour</span>
        <div className="layer-style-swatches">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`color-swatch${safeStyle.color === color ? ' active' : ''}`}
              style={{ background: color }}
              onClick={() => onChange({ color })}
              aria-label={`Set colour ${color}`}
              aria-pressed={safeStyle.color === color}
            />
          ))}
          <label className="color-swatch color-swatch-custom" title="Custom colour">
            <input
              type="color"
              value={safeStyle.color}
              onChange={(e) => onChange({ color: e.target.value })}
              aria-label="Custom colour"
            />
          </label>
        </div>
      </div>

      <div className="layer-style-row">
        <span className="layer-style-label">Outline</span>
        <input
          type="range"
          min="0.5"
          max="6"
          step="0.1"
          value={safeStyle.outlineWidth}
          onChange={(e) => onChange({ outlineWidth: Number(e.target.value) })}
          aria-label={`${label} outline width`}
        />
        <span className="layer-style-value">{safeStyle.outlineWidth.toFixed(1)}px</span>
      </div>

      {isPolygon && (
        <div className="layer-style-row">
          <span className="layer-style-label">Fill</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={safeStyle.fillOpacity}
            onChange={(e) => onChange({ fillOpacity: Number(e.target.value) })}
            aria-label={`${label} fill opacity`}
          />
          <span className="layer-style-value">{Math.round(safeStyle.fillOpacity * 100)}%</span>
        </div>
      )}
    </div>
  );

  return createPortal(body, document.body);
}
