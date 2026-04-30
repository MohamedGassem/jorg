"use client";

import { useCallback, useState } from "react";

type SetField<T> = <K extends keyof T>(key: K, value: T[K]) => void;

export function useFormField<T>(): [
  T | null,
  SetField<T>,
  () => void,
  (v: T) => void,
] {
  const [form, setForm] = useState<T | null>(null);

  const setField: SetField<T> = useCallback((key, value) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const reset = useCallback(() => setForm(null), []);
  const open = useCallback((value: T) => setForm(value), []);

  return [form, setField, reset, open];
}
