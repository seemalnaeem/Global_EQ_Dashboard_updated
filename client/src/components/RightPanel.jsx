import { LuChartColumn } from 'react-icons/lu';
import Clock from './Clock.jsx';
import MagnitudeChart from './MagnitudeChart.jsx';
import Legend from './Legend.jsx';

// The right panel: a fixed rail (with the toggle) on the far right, and a
// content area (clock, magnitude chart, legend) that expands to its left. The
// rail stays put; the content slides out next to it (see index.css). The caller
// resizes the Mapbox map after the width transition.
export default function RightPanel({ quakes, collapsed, onToggle }) {
  return (
    <div id="right-panel" className={collapsed ? 'collapsed' : ''}>
      <div className="right-rail">
        <button
          id="right-panel-toggle"
          type="button"
          onClick={onToggle}
          aria-label="Graph"
          aria-expanded={!collapsed}
          title="Graph"
        >
          <LuChartColumn size={20} />
        </button>
      </div>

      <div className="right-main">
        <Clock />
        <MagnitudeChart quakes={quakes} />
        <Legend quakes={quakes} />
      </div>
    </div>
  );
}
