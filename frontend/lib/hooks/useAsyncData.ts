"use client";

import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "@/lib/errors";

interface AsyncDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches async data and manages loading/error state.
 *
 * The `fetcher` function is intentionally excluded from the effect dependency
 * array. This prevents infinite re-fetch loops when callers pass an inline
 * arrow function. To re-fetch on a dependency change, use the `refetch()`
 * return value or wrap the fetcher in `useCallback`.
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  fallbackError = "Erreur de chargement",
): AsyncDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    fetcher()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(extractErrorMessage(err, fallbackError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  return { data, loading, error, refetch };
}
