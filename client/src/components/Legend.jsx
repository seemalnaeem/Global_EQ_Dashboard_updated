import { useMemo } from 'react';

// Fixed four-bucket magnitude scale (matches the map circles and config). Each
// row also shows how many of the currently-shown quakes fall in that bucket, so
// the legend carries live information instead of sitting mostly empty.
const BUCKETS = [
  { cls: 'circle1', label: 'Mag 6.1 or >', test: (m) => m >= 6.1 },
  { cls: 'circle2', label: 'Mag 5.1 to 6.0', test: (m) => m >= 5.1 && m < 6.1 },
  { cls: 'circle3', label: 'Mag 4.1 to 5.0', test: (m) => m >= 4.1 && m < 5.1 },
  { cls: 'circle4', label: 'Mag 3.0 to 4.0', test: (m) => m < 4.1 }
];

export default function Legend({ quakes = [] }) {
  const counts = useMemo(() => {
    const c = [0, 0, 0, 0];
    quakes.forEach((q) => {
      const m = q.magnitude;
      if (m === null || m === undefined || Number.isNaN(m)) return;
      for (let i = 0; i < BUCKETS.length; i += 1) {
        if (BUCKETS[i].test(m)) {
          c[i] += 1;
          break;
        }
      }
    });
    return c;
  }, [quakes]);

  const total = counts.reduce((a, b) => a + b, 0);

  return (
    <div id="legend">
      <div className="legend-title">Recent Earthquakes by Magnitude</div>
      <div className="legend-sub">Magnitude</div>
      <div className="items">
        {BUCKETS.map((bucket, i) => (
          <div className="legend-item" key={bucket.cls}>
            <div className="legend-circle">
              <div className={bucket.cls}></div>
            </div>
            <div className="legend-label">{bucket.label}</div>
            <div className="legend-count">{counts[i]}</div>
          </div>
        ))}
      </div>
      <div className="legend-total">
        <span>Total shown</span>
        <span className="legend-count">{total}</span>
      </div>
    </div>
  );
}
