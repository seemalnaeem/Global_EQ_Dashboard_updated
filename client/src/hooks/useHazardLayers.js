import { useCallback, useEffect, useState } from 'react';
import { getHazardLayers } from '../api/client.js';

const DEFAULT_OPACITY = 0.8;

// Loads the /api/hazard-layers catalog (external OpenQuake GEM PGA layers,
// proxied through our server) and keeps per-layer UI controls (visible,
// opacity) keyed by name. Tiles are only requested when a layer is visible.
export function useHazardLayers() {
  const [catalog, setCatalog] = useState([]);
  const [catalogError, setCatalogError] = useState(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [controls, setControls] = useState({});

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    getHazardLayers()
      .then((list) => {
        if (cancelled) return;
        setCatalog(list);
        setCatalogError(null);
        setControls((prev) => {
          const next = { ...prev };
          list.forEach((entry) => {
            if (!next[entry.name]) next[entry.name] = { visible: false, opacity: DEFAULT_OPACITY };
          });
          return next;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setCatalog([]);
        setCatalogError(err.message || 'failed to load hazard layers');
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
