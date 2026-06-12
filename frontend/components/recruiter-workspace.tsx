"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import type {
  BuiltinTemplate,
  Organization,
  RecruiterProfile,
  Template,
} from "@/types/api";

interface RecruiterWorkspace {
  profile: RecruiterProfile | null;
  email: string | null;
  orgId: string | null;
  org: Organization | null;
  templates: Template[];
  builtinTemplates: BuiltinTemplate[];
  loading: boolean;
  error: string | null;
}

const RecruiterWorkspaceContext = createContext<RecruiterWorkspace | null>(
  null,
);

/**
 * Contexte recruteur charge une fois au seam du layout : profil, email,
 * organisation, templates org et modeles Jorg. Les pages ne re-fetchent
 * jamais ce contexte ; leurs donnees propres restent dans les pages.
 */
export function RecruiterWorkspaceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [workspace, setWorkspace] = useState<RecruiterWorkspace>({
    profile: null,
    email: null,
    orgId: null,
    org: null,
    templates: [],
    builtinTemplates: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.get<RecruiterProfile>("/recruiters/me/profile"),
      api.get<{ email: string }>("/auth/me").catch(() => null),
    ])
      .then(async ([profile, me]) => {
        const orgId = profile.organization_id;
        let org: Organization | null = null;
        let templates: Template[] = [];
        let builtinTemplates: BuiltinTemplate[] = [];
        if (orgId) {
          [org, templates, builtinTemplates] = await Promise.all([
            api.get<Organization>(`/organizations/${orgId}`).catch(() => null),
            api
              .get<Template[]>(`/organizations/${orgId}/templates`)
              .catch(() => [] as Template[]),
            api
              .get<BuiltinTemplate[]>("/templates/builtin")
              .catch(() => [] as BuiltinTemplate[]),
          ]);
        }
        if (!mounted) return;
        setWorkspace({
          profile,
          email: me?.email ?? null,
          orgId,
          org,
          templates,
          builtinTemplates,
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        if (!mounted) return;
        setWorkspace((prev) => ({
          ...prev,
          loading: false,
          error: extractErrorMessage(err, "Impossible de charger le profil"),
        }));
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <RecruiterWorkspaceContext.Provider value={workspace}>
      {children}
    </RecruiterWorkspaceContext.Provider>
  );
}

export function useRecruiterWorkspace(): RecruiterWorkspace {
  const ctx = useContext(RecruiterWorkspaceContext);
  if (!ctx) {
    throw new Error(
      "useRecruiterWorkspace requiert RecruiterWorkspaceProvider",
    );
  }
  return ctx;
}
