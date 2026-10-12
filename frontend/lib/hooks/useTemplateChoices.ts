"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import type { BuiltinTemplate, Template } from "@/types/api";

interface TemplateChoices {
  builtinTemplates: BuiltinTemplate[];
  orgTemplates: Template[];
  loading: boolean;
  loaded: boolean;
  loadError: string | null;
}

/** Load the templates a dossier can be generated from: builtin Jorg models, plus
 *  the organization's valid+active templates when an org is in scope. Shared by
 *  the generation dialog and the adapted-dossier editor. Loads once, when opened. */
export function useTemplateChoices(
  open: boolean,
  orgId: string | null,
): TemplateChoices {
  const [builtinTemplates, setBuiltinTemplates] = useState<BuiltinTemplate[]>(
    [],
  );
  const [orgTemplates, setOrgTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    setLoading(true);
    Promise.all([
      api.get<BuiltinTemplate[]>("/templates/builtin"),
      orgId
        ? api
            .get<Template[]>(`/organizations/${orgId}/templates`)
            .then((list) =>
              list.filter((t) => t.is_valid && t.status === "active"),
            )
        : Promise.resolve([] as Template[]),
    ])
      .then(([builtins, orgs]) => {
        setBuiltinTemplates(builtins);
        setOrgTemplates(orgs);
        setLoaded(true);
      })
      .catch((err) =>
        setLoadError(
          extractErrorMessage(err, "Impossible de charger les modèles"),
        ),
      )
      .finally(() => setLoading(false));
  }, [open, loaded, orgId]);

  return { builtinTemplates, orgTemplates, loading, loaded, loadError };
}
