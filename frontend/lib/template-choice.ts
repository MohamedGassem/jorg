/** Le choix d'un modèle de dossier : modèle Jorg builtin ou template organisation. */
export type TemplateChoice =
  | { source: "jorg"; key: string }
  | { source: "org"; id: string };

/** Badge court par modèle Jorg builtin (clé -> libellé). */
export const MODEL_BADGES: Record<string, string> = {
  compact_esn: "Compact",
  dossier_technique: "Technique",
  profil_premium: "Complet",
};

/** Valeur stable pour un Select ou un state (préfixes historiques conservés). */
export function templateChoiceValue(choice: TemplateChoice): string {
  return choice.source === "jorg" ? `system:${choice.key}` : `org:${choice.id}`;
}

export function parseTemplateChoice(value: string): TemplateChoice | null {
  if (value.startsWith("system:")) {
    return { source: "jorg", key: value.slice("system:".length) };
  }
  if (value.startsWith("org:")) {
    return { source: "org", id: value.slice("org:".length) };
  }
  return null;
}

/** Corps API correspondant (génération unitaire et groupée). */
export function templateChoiceBody(
  choice: TemplateChoice,
): { system_template_key: string } | { template_id: string } {
  return choice.source === "jorg"
    ? { system_template_key: choice.key }
    : { template_id: choice.id };
}
