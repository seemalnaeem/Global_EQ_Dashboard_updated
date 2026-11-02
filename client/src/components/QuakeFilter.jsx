import { useState } from 'react';
import {
  buildFilterParams,
  defaultFilterFields,
  defaultFilterParams,
  isoToUsDate,
  usDateToIso,
  validateFilterFields
} from '../utils/quakeFilter.js';
import { isoDaysAgo } from '../config.js';

// Quick time windows, in days. "All" clears back to the default window.
const CHIPS = [
  { key: '1', label: '24h', days: 1 },
  { key: '7', label: '7d', days: 7 },
  { key: '30', label: '30d', days: 30 },
  { key: 'all', label: 'All', days: null }
];

// Date / magnitude / depth range filter, ported from the old portal's
// filters.js. Applies on the Apply button (not per-keystroke); the quick chips
// set the date range and apply; Clear/All reset to the default window. The
// status line reflects the current load (driven by props from App).
export default function QuakeFilter({ onApply, loading, shown, total, error }) {
  const [fields, setFields] = useState(defaultFilterFields);
  // The date inputs are shown as MM/DD/YYYY text (fields stay ISO internally).
  const [dateText, setDateText] = useState(() => {
    const init = defaultFilterFields();
    return { fromDate: isoToUsDate(init.fromDate), toDate: isoToUsDate(init.toDate) };
  });
  const [activeChip, setActiveChip] = useState('all');

  function setField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setActiveChip(null);
  }

  // Keep the raw text and the ISO field in sync as the user types. Incomplete
  // or invalid text leaves the ISO bound empty (dropped from the query).
  function setDateField(key, text) {
    setDateText((prev) => ({ ...prev, [key]: text }));
    setFields((prev) => ({ ...prev, [key]: usDateToIso(text) }));
    setActiveChip(null);
  }

  function syncDateText(next) {
    setDateText({ fromDate: isoToUsDate(next.fromDate), toDate: isoToUsDate(next.toDate) });
  }

  function handleApply() {
    if (
      (dateText.fromDate && !usDateToIso(dateText.fromDate)) ||
      (dateText.toDate && !usDateToIso(dateText.toDate))
    ) {
      // eslint-disable-next-line no-alert
      window.alert('Enter dates as MM/DD/YYYY.');
      return;
    }
    const message = validateFilterFields(fields);
    if (message) {
      // eslint-disable-next-line no-alert
      window.alert(message);
      return;
    }
    onApply(buildFilterParams(fields));
  }

  function handleClear() {
    const cleared = defaultFilterFields();
    setFields(cleared);
    syncDateText(cleared);
    setActiveChip('all');
    onApply(defaultFilterParams());
  }

  function handleChip(chip) {
    setActiveChip(chip.key);
    if (chip.days === null) {
      handleClear();
      return;
    }
    const next = {
      ...fields,
      fromDate: isoDaysAgo(chip.days),
      toDate: isoDaysAgo(0)
    };
    setFields(next);
    syncDateText(next);
    onApply(buildFilterParams(next));
  }

  // quakes shipped to the map are capped at the query limit, so when the filter
  // matches more we say "showing N of total" rather than implying the cap is
  // the real count.
  function matchText() {
    if (!total) return 'No earthquakes match';
    if (shown < total) {
      return `Showing ${shown.toLocaleString()} of ${total.toLocaleString()} earthquakes`;
    }
    return `Showing ${total.toLocaleString()} earthquake${total === 1 ? '' : 's'}`;
  }

  const status = loading
    ? { text: 'Loading data…', kind: 'loading' }
    : error
      ? { text: 'Could not load data, check the connection.', kind: 'error' }
      : { text: matchText(), kind: 'done' };

  return (
    <div id="filter-panel">
      <div id="filter-panel-inner">
        <div className="cp-daterow">
          <label className="cp-field">
            <span className="cp-field-label">From</span>
            <input
              type="text"
              className="filter-input"
              placeholder="MM/DD/YYYY"
              inputMode="numeric"
              value={dateText.fromDate}
              onChange={(e) => setDateField('fromDate', e.target.value)}
            />
          </label>
          <label className="cp-field">
            <span className="cp-field-label">To</span>
            <input
              type="text"
              className="filter-input"
              placeholder="MM/DD/YYYY"
              inputMode="numeric"
              value={dateText.toDate}
              onChange={(e) => setDateField('toDate', e.target.value)}
            />
          </label>
        </div>

        <div className="cp-chips">
          {CHIPS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={`cp-chip${activeChip === chip.key ? ' active' : ''}`}
              onClick={() => handleChip(chip)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="filter-row">
          <label><b>Magnitude</b></label>
          <input
            type="number"
            className="filter-input"
            placeholder="Min"
            min="0"
            max="10"
            step="0.1"
            value={fields.magMin}
            onChange={(e) => setField('magMin', e.target.value)}
          />
          <span className="range-dash">&ndash;</span>
          <input
            type="number"
            className="filter-input"
            placeholder="Max"
            min="0"
            max="10"
            step="0.1"
            value={fields.magMax}
            onChange={(e) => setField('magMax', e.target.value)}
          />
        </div>

        <div className="filter-row">
          <label><b>Depth (km)</b></label>
          <input
            type="number"
            className="filter-input"
            placeholder="Min"
            min="-10"
            max="1000"
            step="1"
            value={fields.depthMin}
            onChange={(e) => setField('depthMin', e.target.value)}
          />
          <span className="range-dash">&ndash;</span>
          <input
            type="number"
            className="filter-input"
            placeholder="Max"
            min="-10"
            max="1000"
            step="1"
            value={fields.depthMax}
            onChange={(e) => setField('depthMax', e.target.value)}
          />
        </div>

        <div className="filter-buttons">
          <button type="button" className="cp-btn cp-btn-primary" onClick={handleApply} disabled={loading}>
            Apply Filter
          </button>
          <button type="button" className="cp-btn" onClick={handleClear} disabled={loading}>
            Clear
          </button>
        </div>

        <div className={`filter-status ${status.kind}`} role="status" aria-live="polite">
          {status.text}
        </div>
      </div>
    </div>
  );
}
