"use client";

import { useCallback, useState } from "react";
import { extractErrorMessage } from "@/lib/errors";

export function useAsyncOp(defaultErrMsg = "Erreur") {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setSaving(true);
      setError(null);
      try {
        await fn();
      } catch (err) {
        setError(extractErrorMessage(err, defaultErrMsg));
      } finally {
        setSaving(false);
      }
    },
    [defaultErrMsg],
  );

  const clearError = useCallback(() => setError(null), []);

  return { run, saving, error, clearError };
}
