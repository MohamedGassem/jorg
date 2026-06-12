import type { CandidateProfile } from "@/types/api";

export interface CompletionCheck {
  label: string;
  done: boolean;
}

function filled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Critères canoniques de complétude du dossier candidat (source unique). */
export function profileCompletionChecks(
  profile: CandidateProfile | null,
  extras: { hasExperience: boolean; hasSkill: boolean },
): CompletionCheck[] {
  return [
    {
      label: "Identité & titre",
      done:
        filled(profile?.first_name) &&
        filled(profile?.last_name) &&
        filled(profile?.title),
    },
    { label: "Résumé", done: filled(profile?.summary) },
    { label: "Une expérience", done: extras.hasExperience },
    { label: "Une compétence", done: extras.hasSkill },
    {
      label: "Contact & disponibilité",
      done:
        filled(profile?.phone) &&
        filled(profile?.location) &&
        filled(profile?.work_mode),
    },
  ];
}

export function completionPercent(checks: CompletionCheck[]): number {
  if (checks.length === 0) return 0;
  return Math.round(
    (checks.filter((c) => c.done).length / checks.length) * 100,
  );
}
