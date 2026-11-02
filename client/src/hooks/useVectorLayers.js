import { useCallback, useEffect, useState } from 'react';
import { getLayers } from '../api/client.js';
import { buildLayerOrder, mergeLayerOrder, defaultLayerStyle } from '../utils/vectorLayers.js';
import { reorderWithinGroup } from '../utils/layerOrder.js';

// Loads the /api/layers catalog and tracks per-layer visibility, live style
// (color/outline width/fill opacity), and draw order. Rendering no longer
// needs whole-layer GeoJSON: MapView pulls Mapbox Vector Tiles per viewport
// from /api/tiles/:layer/{z}/{x}/{y}.pbf, so this hook only owns the catalog
// plus this UI state, keyed by name.
export function useVectorLayers() {
  const [catalog, setCatalog] = useState([]);
  const [catalogError, setCatalogError] = useState(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [visibility, setVisibility] = useState({});
  const [order, setOrder] = useState([]);
  const [styles, setStyles] = useState({});

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    getLayers()
      .then((list) => {
        if (cancelled) return;
        setCatalog(list);
        setCatalogError(null);

        const names = list.map((entry) => entry.name);

        // Start with every layer off except the tectonic plate boundaries,
        // which are shown by default. The rest are toggled on from the drawer.
        setVisibility((prev) => {
          const next = { ...prev };
          list.forEach((entry) => {
            if (!(entry.name in next)) next[entry.name] = entry.name === 'tectonic_boundaries';
          });
          return next;
        });

        // First load seeds the canonical order; a later refresh merges in
        // any newly seen names while preserving an in-progress drag order.
        setOrder((prev) => (prev.length === 0 ? buildLayerOrder(names) : mergeLayerOrder(prev, names)));

        setStyles((prev) => {
          const next = { ...prev };
          list.forEach((entry) => {
            if (!next[entry.name]) next[entry.name] = defaultLayerStyle(entry.name);
          });
          return next;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setCatalog([]);
        setCatalogError(err.message || 'failed to load layer catalog');
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleLayer = useCallback((name) => {
    setVisibility((prev) => ({ ...prev, [name]: !prev[name] }));
  }, []);

  const updateStyle = useCallback((name, patch) => {
    setStyles((prev) => ({
      ...prev,
      [name]: { ...(prev[name] || defaultLayerStyle(name)), ...patch }
    }));
  }, []);

  // groupNames scopes the reorder to one panel section (Boundaries or
  // Tectonics); see utils/layerOrder.js for why this is a no-op outside it.
  const reorderLayer = useCallback((groupNames, fromName, toName) => {
    setOrder((prev) => reorderWithinGroup(prev, groupNames, fromName, toName));
  }, []);

  return {
    catalog,
    catalogLoading,
    catalogError,
    visibility,
    toggleLayer,
    order,
    styles,
    updateStyle,
    reorderLayer
  };
}
