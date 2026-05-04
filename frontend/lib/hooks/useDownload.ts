"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";

interface UseDownload {
  download: (path: string, filename: string, id: string) => void;
  errors: Record<string, string>;
  clearError: (id: string) => void;
}

export function useDownload(): UseDownload {
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearError = useCallback((id: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const download = useCallback(
    (path: string, filename: string, id: string) => {
      clearError(id);
      api.download(path, filename).catch((err) => {
        if (mountedRef.current) {
          setErrors((prev) => ({
            ...prev,
            [id]: extractErrorMessage(err, "Erreur de téléchargement"),
          }));
        }
      });
    },
    [clearError],
  );

  return { download, errors, clearError };
}
