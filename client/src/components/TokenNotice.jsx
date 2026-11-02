import { useState } from 'react';
import { LuTriangleAlert, LuX } from 'react-icons/lu';

// Shown when VITE_MAPBOX_TOKEN is empty. Overlays (vectors, rasters, quakes)
// still render; only the Mapbox base map tiles are unavailable, so we degrade
// to a blank background instead of crashing.
export default function TokenNotice() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="overlay-banner token-notice">
      <LuTriangleAlert size={15} aria-hidden="true" />
      <span>No Mapbox token set. Base map stays blank; overlays still work.</span>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss notice">
        <LuX size={14} />
      </button>
    </div>
  );
}
