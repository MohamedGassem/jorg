"use client";

import { useAsyncData } from "./useAsyncData";
import { api } from "@/lib/api";
import type { RecruiterProfile } from "@/types/api";

interface RecruiterOrgState {
  orgId: string | null;
  profile: RecruiterProfile | null;
  loading: boolean;
  error: string | null;
}

export function useRecruiterOrg(): RecruiterOrgState {
  const {
    data: profile,
    loading,
    error,
  } = useAsyncData<RecruiterProfile>(
    () => api.get<RecruiterProfile>("/recruiters/me/profile"),
    "Impossible de charger le profil",
  );

  return {
    orgId: profile?.organization_id ?? null,
    profile,
    loading,
    error,
  };
}
