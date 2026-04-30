"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import type { RecruiterProfile } from "@/types/api";

interface RecruiterOrgState {
  orgId: string | null;
  profile: RecruiterProfile | null;
  loading: boolean;
  error: string | null;
}

export function useRecruiterOrg(): RecruiterOrgState {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [profile, setProfile] = useState<RecruiterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<RecruiterProfile>("/recruiters/me/profile")
      .then((p) => {
        if (!cancelled) {
          setProfile(p);
          setOrgId(p.organization_id ?? null);
        }
      })
      .catch((err) => {
        if (!cancelled)
          setError(extractErrorMessage(err, "Impossible de charger le profil"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { orgId, profile, loading, error };
}
