import { useMemo } from 'react';
import { rowColorByMagnitude } from '../config.js';

function formatMag(mag) {
  return mag === null || mag === undefined || Number.isNaN(mag) ? 'N/A' : mag.toFixed(1);
}

// Date and time split onto two lines so the Time column stays narrow (no
// horizontal scroll). Returns null when the timestamp is missing/invalid.
function formatDateTime(occurredAt) {
  if (!occurredAt) return null;
  const d = new Date(occurredAt);
  if (Number.isNaN(d.getTime())) return null;
  return { date: d.toLocaleDateString(), time: d.toLocaleTimeString() };
}

// The left "Recent Earthquakes" table, newest first, rows tinted by magnitude.
// Clicking a row focuses that quake on the map (via onSelect).
export default function QuakeTable({ quakes, onSelect }) {
  const rows = useMemo(
    () => [...quakes].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)),
    [quakes]
  );

  return (
    <div id="eq-table-container">
      <h3>Recent Earthquakes</h3>
      <table id="eq-table">
        <thead>
          <tr>
            <th>Magnitude</th>
            <th>Location</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((quake) => {
            const when = formatDateTime(quake.occurredAt);
            return (
              <tr
                key={quake.id}
                style={{ '--mag-color': rowColorByMagnitude(quake.magnitude) }}
                onClick={() => onSelect(quake)}
              >
                <td>{formatMag(quake.magnitude)}</td>
                <td>{quake.place ?? 'Unknown'}</td>
                <td className="eq-when">
                  {when ? (
                    <>
                      <span className="eq-date">{when.date}</span>
                      <span className="eq-time">{when.time}</span>
                    </>
                  ) : (
                    'N/A'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
