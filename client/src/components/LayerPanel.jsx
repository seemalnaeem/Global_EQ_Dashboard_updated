import { useState } from 'react';
import { LuEye, LuEyeOff, LuGripVertical, LuMap, LuMapPin, LuSpline } from 'react-icons/lu';
import {
  vectorLayerIconKind,
  vectorLayerLabel,
  BOUNDARY_LAYER_NAMES,
  TECTONIC_LAYER_NAMES
} from '../utils/vectorLayers.js';
import LayerStylePopover from './LayerStylePopover.jsx';

const ROW_ICONS = { point: LuMapPin, admin: LuMap, line: LuSpline };

// Fixed panel sections. Group membership is fixed (matches the four admin
// levels and the three tectonic layers); drag-reorder only ever reorders a
// row within its own section, via onReorder(groupNames, fromName, toName).
// The master draw-order array (order prop) is flat and drives the map's
// stacking regardless of which section a row is displayed under.
const GROUPS = [
  { key: 'boundaries', label: 'Boundaries', names: BOUNDARY_LAYER_NAMES },
  { key: 'tectonics', label: 'Tectonics', names: TECTONIC_LAYER_NAMES }
];

// Toggle + style + reorder panel for vector layers from /api/layers
// (fault_lines, tectonic_boundaries, tectonic_points, national_boundary,
// provincial_boundary, district_boundary, tehsil_boundary). Each layer
// renders as Mapbox Vector Tiles fetched per viewport, so there is no
// per-layer loading/error state here, only on/off visibility, live style,
// and draw order.
export default function LayerPanel({
  catalog,
  catalogLoading,
  catalogError,
  visibility,
  onToggle,
  order,
  styles,
  onUpdateStyle,
  onReorder
}) {
  const [openStyleFor, setOpenStyleFor] = useState(null);
  const [styleAnchor, setStyleAnchor] = useState(null);
  const [dragName, setDragName] = useState(null);

  function closeStyle() {
    setOpenStyleFor(null);
    setStyleAnchor(null);
  }

  if (catalogLoading) return <p className="panel-hint">Loading layers...</p>;
  if (catalogError) return <p className="panel-hint error">Layers unavailable: {catalogError}</p>;
  if (catalog.length === 0) return <p className="panel-hint">No vector layers available.</p>;

  const catalogByName = new Map(catalog.map((entry) => [entry.name, entry]));
  const groupedNames = new Set(GROUPS.flatMap((group) => group.names));
  const ungroupedEntries = catalog.filter((entry) => !groupedNames.has(entry.name));

  function handleDrop(groupNames, targetName) {
    if (dragName && dragName !== targetName) {
      onReorder(groupNames, dragName, targetName);
    }
    setDragName(null);
  }

  function renderRow(name, groupNames) {
    const entry = catalogByName.get(name);
    if (!entry) return null;
    const visible = !!visibility[name];
    const style = styles[name];
    const RowIcon = ROW_ICONS[vectorLayerIconKind(name)] || LuSpline;
    const isOpen = openStyleFor === name;
    const label = vectorLayerLabel(name);

    return (
      <li
        key={name}
        className={`layer-item${dragName === name ? ' dragging' : ''}`}
        draggable
        onDragStart={(e) => {
          setDragName(name);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', name);
        }}
        onDragOver={(e) => {
          if (dragName && dragName !== name) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          handleDrop(groupNames, name);
        }}
        onDragEnd={() => setDragName(null)}
      >
        <div className="layer-item-row">
          <span className="layer-drag-handle" aria-hidden="true" title="Drag to reorder">
            <LuGripVertical size={14} />
          </span>
          <button
            type="button"
            className="layer-row"
            onClick={() => onToggle(name)}
            aria-pressed={visible}
          >
            <RowIcon size={14} className="layer-row-icon" aria-hidden="true" />
            <span className="layer-row-label">{label}</span>
            {visible ? (
              <LuEye size={14} aria-hidden="true" />
            ) : (
              <LuEyeOff size={14} aria-hidden="true" className="muted" />
            )}
          </button>
          <button
            type="button"
            className="layer-style-trigger"
            style={{ '--swatch-color': style?.color || '#8b949e' }}
            onClick={(e) => {
              if (isOpen) {
                closeStyle();
              } else {
                setOpenStyleFor(name);
                setStyleAnchor(e.currentTarget);
              }
            }}
            aria-label={`Style ${label}`}
            aria-expanded={isOpen}
          >
            <span className="layer-style-swatch" />
          </button>
        </div>
        {isOpen && (
          <LayerStylePopover
            anchorEl={styleAnchor}
            name={name}
            label={label}
            featureCount={entry.feature_count}
            style={style}
            onChange={(patch) => onUpdateStyle(name, patch)}
            onClose={closeStyle}
          />
        )}
      </li>
    );
  }

  return (
    <div className="layer-panel">
      {GROUPS.map((group) => {
        const names = order.filter((name) => group.names.includes(name) && catalogByName.has(name));
        if (names.length === 0) return null;
        return (
          <div className="layer-group" key={group.key}>
            <h3 className="layer-group-title">{group.label}</h3>
            <ul className="layer-list">{names.map((name) => renderRow(name, group.names))}</ul>
          </div>
        );
      })}
      {ungroupedEntries.length > 0 && (
        <div className="layer-group">
          <ul className="layer-list">
            {ungroupedEntries.map((entry) =>
              renderRow(
                entry.name,
                ungroupedEntries.map((e) => e.name)
              )
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
