"use client";

import { useCallback, useEffect, useState } from "react";

export function useSearchableSelect<T>(
  searchFn: (query: string) => Promise<T[]>,
  debounceMs = 300,
) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const r = await searchFn(query);
        setResults(r);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
    // searchFn excluded intentionally — callers pass a stable reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, debounceMs]);

  const clear = useCallback(() => {
    setQuery("");
    setResults([]);
  }, []);

  return { query, setQuery, results, searching, clear };
}
