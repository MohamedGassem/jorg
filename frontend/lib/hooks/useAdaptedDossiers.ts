"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import type { GenerationTarget } from "@/components/dossier-generation-dialog";

export interface DossierSummary {
  id: string;
  name: string | null;
  is_general: boolean;
  created_at: string;
}
export interface DossierDetail extends DossierSummary {
  objectif: string | null;
  accroche: string | null;
  share_contact: boolean;
  share_finances: boolean;
  experience_selections: {
    experience_id: string;
    position: number;
    is_featured: boolean;
  }[];
  skill_selections: {
    candidate_skill_id: string;
    position: number;
    is_featured: boolean;
  }[];
}
export interface SavePayload {
  currentId: string | null;
  metadata: {
    name: string | null;
    objectif: string | null;
    accroche: string | null;
    share_contact: boolean;
    share_finances: boolean;
  };
  experiences: { experience_id: string; is_featured: boolean }[];
  skills: { candidate_skill_id: string; is_featured: boolean }[];
}

// Recruiter list/general endpoints are grant-scoped via query params; the
// candidate's own dossiers need none.
function scope(target: GenerationTarget): string {
  return target.kind === "recruiter"
    ? `?organization_id=${target.orgId}&candidate_id=${target.candidateId}`
    : "";
}

export function useAdaptedDossiers(open: boolean, target: GenerationTarget) {
  const [versions, setVersions] = useState<DossierSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const q = scope(target);

  const refresh = useCallback(async () => {
    try {
      // Materialise the base so it always shows, then list (base + adapted).
      await api.get<DossierSummary>(`/dossiers/general${q}`);
      const list = await api.get<DossierSummary[]>(`/dossiers${q}`);
      const base = list.filter((d) => d.is_general);
      const adapted = list.filter((d) => !d.is_general);
      setVersions([...base, ...adapted]);
    } catch (err) {
      setLoadError(
        extractErrorMessage(err, "Impossible de charger les versions"),
      );
    }
  }, [q]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const loadDetail = useCallback(
    (id: string) => api.get<DossierDetail>(`/dossiers/${id}`),
    [],
  );

  const saveDossier = useCallback(
    async (payload: SavePayload): Promise<string> => {
      let id = payload.currentId;
      if (id === null) {
        const body =
          target.kind === "recruiter"
            ? {
                candidate_id: target.candidateId,
                organization_id: target.orgId,
                ...payload.metadata,
              }
            : payload.metadata;
        const created = await api.post<{ id: string }>("/dossiers", body);
        id = created.id;
      } else {
        await api.patch(`/dossiers/${id}`, payload.metadata);
      }
      await api.put(`/dossiers/${id}/experiences`, payload.experiences);
      await api.put(`/dossiers/${id}/skills`, payload.skills);
      await refresh();
      return id;
    },
    [target, refresh],
  );

  const deleteDossier = useCallback(
    async (id: string) => {
      await api.delete(`/dossiers/${id}`);
      await refresh();
    },
    [refresh],
  );

  return {
    versions,
    loadError,
    refresh,
    loadDetail,
    saveDossier,
    deleteDossier,
  };
}
