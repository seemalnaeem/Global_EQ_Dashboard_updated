import { useCallback, useEffect, useState } from 'react';
import { getRasters } from '../api/client.js';
import { defaultRasterControls } from '../utils/rasterTiles.js';

// Raster COGs hidden from the overlays UI. The PGA COG is superseded by the
// OpenQuake GEM PGA layers under the SEISMIC HAZARD section.
const HIDDEN_RASTERS = new Set(['pga_hazard_world']);

// Loads the /api/rasters catalog and keeps per-raster UI controls (visible,
// opacity, colormap, rescale) keyed by name. No COG fetch happens here; tile
// URLs are only built when a raster is visible (see MapView).
export function useRasterCatalog() {
  const [catalog, setCatalog] = useState([]);
  const [catalogError, setCatalogError] = useState(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [controls, setControls] = useState({});

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    getRasters()
      .then((rawList) => {
        if (cancelled) return;
        const list = rawList.filter((entry) => !HIDDEN_RASTERS.has(entry.name));
        setCatalog(list);
        setCatalogError(null);
        setControls((prev) => {
          const next = { ...prev };
          list.forEach((entry) => {
            if (!next[entry.name]) next[entry.name] = defaultRasterControls(entry);
          });
          return next;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setCatalog([]);
        setCatalogError(err.message || 'failed to load raster catalog');
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateControl = useCallback((name, patch) => {
    setControls((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }));
  }, []);

  return { catalog, catalogLoading, catalogError, controls, updateControl };
}
