"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";

interface CrudSectionConfig<TItem extends { id: string }, TForm> {
  endpoint: string;
  emptyForm: TForm;
  toForm: (item: TItem) => TForm;
  toBody: (form: TForm) => Record<string, unknown>;
  fetchErrorMsg?: string;
  saveErrorMsg?: string;
  deleteErrorMsg?: string;
}

export interface CrudSectionState<TItem, TForm> {
  items: TItem[];
  loading: boolean;
  fetchError: string | null;
  adding: boolean;
  editingId: string | null;
  form: TForm;
  setForm: React.Dispatch<React.SetStateAction<TForm>>;
  saving: boolean;
  deleting: string | null;
  error: string | null;
  setField: <K extends keyof TForm>(key: K, value: TForm[K]) => void;
  startAdd: () => void;
  startEdit: (item: TItem) => void;
  cancelForm: () => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
}

export function useCrudSection<TItem extends { id: string }, TForm>({
  endpoint,
  emptyForm,
  toForm,
  toBody,
  fetchErrorMsg = "Impossible de charger les données",
  saveErrorMsg = "Erreur lors de la sauvegarde",
  deleteErrorMsg = "Erreur lors de la suppression",
}: CrudSectionConfig<TItem, TForm>): CrudSectionState<TItem, TForm> {
  const [items, setItems] = useState<TItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<TItem[]>(endpoint)
      .then(setItems)
      .catch((err) => setFetchError(extractErrorMessage(err, fetchErrorMsg)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setField<K extends keyof TForm>(key: K, value: TForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setAdding(true);
  }

  function startEdit(item: TItem) {
    setAdding(false);
    setEditingId(item.id);
    setForm(toForm(item));
    setError(null);
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const updated = await api.put<TItem>(
          `${endpoint}/${editingId}`,
          toBody(form),
        );
        setItems((prev) => prev.map((i) => (i.id === editingId ? updated : i)));
        setEditingId(null);
      } else {
        const created = await api.post<TItem>(endpoint, toBody(form));
        setItems((prev) => [...prev, created]);
        setAdding(false);
      }
      setForm(emptyForm);
    } catch (err) {
      setError(extractErrorMessage(err, saveErrorMsg));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (deleting) return;
    setDeleting(id);
    try {
      await api.delete(`${endpoint}/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(extractErrorMessage(err, deleteErrorMsg));
    } finally {
      setDeleting(null);
    }
  }

  return {
    items,
    loading,
    fetchError,
    adding,
    editingId,
    form,
    setForm,
    saving,
    deleting,
    error,
    setField,
    startAdd,
    startEdit,
    cancelForm,
    handleSubmit,
    handleDelete,
  };
}
