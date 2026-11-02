import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LuActivity,
  LuArrowLeftRight,
  LuCalendarRange,
  LuChevronDown,
  LuEye,
  LuEyeOff,
  LuLayers,
  LuRadio,
  LuTable2,
  LuWaves
} from 'react-icons/lu';
import QuakeFilter from './QuakeFilter.jsx';
import LayerPanel from './LayerPanel.jsx';
import RasterPanel from './RasterPanel.jsx';

// The controls drawer: a slim fixed rail holding the toggle, plus a content
// area that expands to the right of the rail (the rail stays put). Expanded it
// shows the EARTHQUAKES filter, LAYERS controls, and SEISMIC HAZARD overlays;
// collapsed, only the rail is visible. The open/closed state lives on
// <main class="controls-open"> (owned by App). The scrollbar is hidden (see
// index.css); a bouncing chevron hint appears while more content is below.
export default function ControlPanel({ onToggle, onToggleTable, filter, layers, hazard }) {
  const { vectorLayers, rasters, pulse24hActive, onTogglePulse24h } = layers;

  const bodyRef = useRef(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const updateScrollHint = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    updateScrollHint();
    el.addEventListener('scroll', updateScrollHint, { passive: true });
    window.addEventListener('resize', updateScrollHint);
    return () => {
      el.removeEventListener('scroll', updateScrollHint);
      window.removeEventListener('resize', updateScrollHint);
    };
  }, [updateScrollHint]);

  // Recompute when the layer/raster catalogs finish loading (content grows).
  const catalogSignal = `${vectorLayers.catalog?.length || 0}:${rasters.catalog?.length || 0}`;
  useEffect(() => {
    updateScrollHint();
    const id = window.setTimeout(updateScrollHint, 60);
    return () => window.clearTimeout(id);
  }, [updateScrollHint, catalogSignal]);

  return (
    <aside id="control-panel">
      <div className="control-rail">
        <button id="control-panel-toggle" type="button" aria-label="Layers" title="Layers" onClick={onToggle}>
          <LuLayers size={20} />
        </button>
        <button id="table-toggle" type="button" aria-label="Earthquake table" title="Earthquake table" onClick={onToggleTable}>
          <LuTable2 size={20} />
        </button>
      </div>

      <div className="control-main">
        <div className="control-main-head">
          <span className="control-panel-title">LAYERS</span>
        </div>

        <div className="control-panel-body" ref={bodyRef}>
          <section className="cp-section">
            <div className="cp-section-head">
              <LuCalendarRange className="cp-section-icon" size={16} />
              <span>EARTHQUAKES</span>
            </div>
            <QuakeFilter
              onApply={filter.onApply}
              loading={filter.loading}
              shown={filter.shown}
              total={filter.total}
              error={filter.error}
            />
          </section>

          <section className="cp-section">
            <div className="cp-section-head">
              <LuWaves className="cp-section-icon" size={16} />
              <span>LAYERS</span>
            </div>

            <LayerPanel
              catalog={vectorLayers.catalog}
              catalogLoading={vectorLayers.catalogLoading}
              catalogError={vectorLayers.catalogError}
              visibility={vectorLayers.visibility}
              onToggle={vectorLayers.toggleLayer}
              order={vectorLayers.order}
              styles={vectorLayers.styles}
              onUpdateStyle={vectorLayers.updateStyle}
              onReorder={vectorLayers.reorderLayer}
            />

            <div className="cp-subhead">RASTER OVERLAYS</div>
            <RasterPanel
              catalog={rasters.catalog}
              catalogLoading={rasters.catalogLoading}
              catalogError={rasters.catalogError}
              controls={rasters.controls}
              onChange={rasters.updateControl}
            />

            <div className="cp-subhead">MORE</div>
            <ul className="layer-list">
              <li className="layer-item">
                <div className="layer-item-row">
                  <button
                    type="button"
                    className="layer-row"
                    onClick={onTogglePulse24h}
                    aria-pressed={pulse24hActive}
                  >
                    <LuRadio size={14} className="layer-row-icon" aria-hidden="true" />
                    <span className="layer-row-label">Last 24 Hours Pulse</span>
                    {pulse24hActive ? (
                      <LuEye size={14} aria-hidden="true" />
                    ) : (
                      <LuEyeOff size={14} aria-hidden="true" className="muted" />
                    )}
                  </button>
                </div>
              </li>
            </ul>
          </section>

          {hazard && hazard.catalog.length > 0 && (
            <section className="cp-section">
              <div className="cp-section-head">
                <LuActivity className="cp-section-icon" size={16} />
                <span>SEISMIC HAZARD</span>
              </div>

              <ul className="layer-list">
                {hazard.catalog.map((entry) => {
                  const visible = !!hazard.controls[entry.name]?.visible;
                  return (
                    <li className="layer-item" key={entry.name}>
                      <div className="layer-item-row">
                        <button
                          type="button"
                          className="layer-row"
                          onClick={() => hazard.onToggle(entry.name)}
                          disabled={hazard.compareActive}
                          aria-pressed={visible}
                        >
                          <LuActivity size={14} className="layer-row-icon" aria-hidden="true" />
                          <span className="layer-row-label">{entry.title}</span>
                          {visible ? (
                            <LuEye size={14} aria-hidden="true" />
                          ) : (
                            <LuEyeOff size={14} aria-hidden="true" className="muted" />
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="cp-subhead">COMPARE</div>
              <ul className="layer-list">
                <li className="layer-item">
                  <div className="layer-item-row">
                    <button
                      type="button"
                      className="layer-row"
                      onClick={hazard.onToggleCompare}
                      aria-pressed={hazard.compareActive}
                    >
                      <LuArrowLeftRight size={14} className="layer-row-icon" aria-hidden="true" />
                      <span className="layer-row-label">Compare 2023 vs 2026</span>
                      {hazard.compareActive ? (
                        <LuEye size={14} aria-hidden="true" />
                      ) : (
                        <LuEyeOff size={14} aria-hidden="true" className="muted" />
                      )}
                    </button>
                  </div>
                </li>
              </ul>
            </section>
          )}
        </div>

        {canScrollDown && (
          <div className="cp-scroll-hint" aria-hidden="true" title="Scroll for more layers">
            <LuChevronDown size={14} />
          </div>
        )}
      </div>
    </aside>
  );
}
