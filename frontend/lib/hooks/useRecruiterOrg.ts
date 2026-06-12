"use client";

import { useRecruiterWorkspace } from "@/components/recruiter-workspace";
import type { RecruiterProfile } from "@/types/api";

interface RecruiterOrgState {
  orgId: string | null;
  profile: RecruiterProfile | null;
  loading: boolean;
  error: string | null;
}

/** Vue restreinte du workspace recruteur (compatibilité des pages existantes). */
export function useRecruiterOrg(): RecruiterOrgState {
  const { orgId, profile, loading, error } = useRecruiterWorkspace();
  return { orgId, profile, loading, error };
}
