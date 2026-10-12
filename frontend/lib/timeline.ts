// Shared timeline helpers for the "Mon profil" editorial parcours
// (plan refonte-ui-mon-dossier.md, garde-fou n°2). The condensation setting N
// is a user preference persisted in localStorage and applied to BOTH the edit
// view and the read-only "Mode lecture" (tranche 5), so the key and the pure
// sort/format helpers live here as the single source of truth.
import type { Experience } from "@/types/api";

export const TIMELINE_N_KEY = "jorg.timeline.detailed";
export type DetailedN = 3 | 5 | 10 | "all";

// Réglage utilisateur persisté (défaut 5), lu après montage pour rester
// compatible SSR.
export function loadDetailedN(): DetailedN {
  if (typeof window === "undefined") return 5;
  const raw = window.localStorage.getItem(TIMELINE_N_KEY);
  if (raw === "all") return "all";
  const n = raw ? Number(raw) : NaN;
  return n === 3 || n === 5 || n === 10 ? n : 5;
}

// Tri éditorial : le poste actuel d'abord, puis fin de mission décroissante.
export function sortExperiences(items: Experience[]): Experience[] {
  return [...items].sort((a, b) => {
    if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
    const aEnd = a.end_date ?? "";
    const bEnd = b.end_date ?? "";
    if (aEnd !== bEnd) return bEnd.localeCompare(aEnd);
    return b.start_date.localeCompare(a.start_date);
  });
}

export function yearRange(exp: Experience): string {
  const start = exp.start_date.slice(0, 4);
  if (exp.is_current) return `${start}—présent`;
  const end = exp.end_date?.slice(0, 4) ?? "";
  if (!end || end === start) return start;
  return `${start}—${end.slice(2)}`;
}
