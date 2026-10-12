import { assembleSkillRows } from "@/lib/skill-proof";
import type {
  CandidateProfile,
  CandidateSkillProjection,
  Experience,
  Skill,
} from "@/types/api";

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

// ---- Lisibilité recruteur (plan refonte-ui-mon-dossier.md, décision 5) -------
// Diagnostic qualitatif déterministe qui remplace la complétude en % dans le
// rail. Étend le principe "source unique" ci-dessus : les règles sont pures,
// ordonnées par priorité, sans pondération cachée.

export type ReadabilityLevel = "ready" | "good" | "hard";

export interface ReadabilityDiagnosis {
  level: ReadabilityLevel;
  statusLabel: string;
  // Nombre total de règles en échec (statut = compte des échecs).
  failureCount: number;
  // Actions concrètes des 3 premières règles en échec, cible nommée.
  actions: string[];
}

const READABILITY_STATUS: Record<ReadabilityLevel, string> = {
  ready: "Prêt à être lu",
  good: "Bon niveau de lecture",
  hard: "Encore difficile à lire pour un recruteur",
};

// Règle 3 ancrée sur les 5 plus récentes quel que soit le réglage d'affichage.
const DETAILED_ANCHOR = 5;

// Tri éditorial : poste actuel d'abord, puis fin de mission décroissante.
// Miroir de la timeline (experience-section.tsx) pour désigner les mêmes
// expériences "détaillées" que celles montrées en tête.
function byRecency(a: Experience, b: Experience): number {
  if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
  const aEnd = a.end_date ?? "";
  const bEnd = b.end_date ?? "";
  if (aEnd !== bEnd) return bEnd.localeCompare(aEnd);
  return b.start_date.localeCompare(a.start_date);
}

function hasNumber(value: string | null): boolean {
  return value != null && /\d/.test(value);
}

export function profileReadability(
  profile: CandidateProfile | null,
  experiences: Experience[],
  skills: Skill[],
  projection: CandidateSkillProjection[],
): ReadabilityDiagnosis {
  const failures: string[] = [];

  // 1. Résumé présent.
  if (!filled(profile?.summary)) {
    failures.push("Rédigez un résumé en 3 lignes");
  }

  // 2. Titre et disponibilité renseignés. La disponibilité est un statut
  // toujours défini ; seule une disponibilité "à partir du" sans date est
  // considérée non renseignée.
  const availabilitySet =
    profile != null &&
    !(
      profile.availability_status === "available_from" &&
      !filled(profile.availability_date)
    );
  if (!filled(profile?.title) || !availabilitySet) {
    failures.push("Clarifiez votre disponibilité");
  }

  // 3. Chaque expérience détaillée (5 plus récentes) a >= 1 réalisation.
  const recent = [...experiences].sort(byRecency).slice(0, DETAILED_ANCHOR);
  const missingAchievement = recent.find((e) => e.achievements.length === 0);
  if (missingAchievement) {
    failures.push(
      `Ajoutez une réalisation à votre mission ${missingAchievement.client_name}`,
    );
  }

  // 4. Au moins une réalisation a un impact chiffré.
  const hasNumericImpact = experiences.some((e) =>
    e.achievements.some((a) => hasNumber(a.impact)),
  );
  if (!hasNumericImpact) {
    const target =
      recent.find((e) => e.achievements.length > 0) ??
      experiences.find((e) => e.achievements.length > 0);
    failures.push(
      target
        ? `Ajoutez un impact chiffré chez ${target.client_name}`
        : "Ajoutez un impact chiffré à une réalisation",
    );
  }

  // 5. Toute compétence mise en avant est prouvée.
  const { highlighted } = assembleSkillRows(skills, projection, experiences);
  const unprovenFeatured = highlighted.find(
    (r) => r.featured && r.state !== "proven",
  );
  if (unprovenFeatured) {
    failures.push(`Reliez ${unprovenFeatured.name} à une réalisation`);
  }

  const failureCount = failures.length;
  const level: ReadabilityLevel =
    failureCount === 0 ? "ready" : failureCount <= 2 ? "good" : "hard";

  return {
    level,
    statusLabel: READABILITY_STATUS[level],
    failureCount,
    actions: failures.slice(0, 3),
  };
}
