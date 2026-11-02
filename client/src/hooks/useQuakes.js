import { useCallback, useEffect, useState } from 'react';
import { getQuakes } from '../api/client.js';

// Loads quakes for an applied filter and exposes a retry. Refetches whenever
// the filter changes identity (serialized key), matching the old portal's
// "fetch on Apply/Clear" model rather than on every keystroke. The filter keys
// are the backend query params (min_mag, max_mag, min_depth, max_depth, from,
// to, limit); undefined values are dropped by the api client.
export function useQuakes(filters = {}) {
  const [quakes, setQuakes] = useState([]);
  // Full matched count from the server; quakes is capped at the query limit.
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const key = JSON.stringify(filters);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getQuakes(JSON.parse(key));
      setQuakes(result.quakes);
      setTotal(result.total);
    } catch (err) {
      setError(err.message || 'failed to load quakes');
      setQuakes([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  return { quakes, total, loading, error, reload: load };
}
