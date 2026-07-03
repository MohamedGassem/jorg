// Rail droit collant de "Mon profil" (plan refonte-ui-mon-dossier.md, tranche 3,
// décision 4). Sommaire avec compteurs + ancres de saut, complétude (remplacée
// par la lisibilité recruteur en tranche 4), résumé visibilité / consentement,
// et l'entrée repliée d'import de CV (le flux complet se déploie dans la colonne
// de lecture).
"use client";

import Link from "next/link";
import { Upload } from "lucide-react";
import { completionPercent, profileCompletionChecks } from "@/lib/completion";
import type { CandidateProfile } from "@/types/api";

interface SommaireCounts {
  parcours: number;
  competences: number;
  formation: number;
  langues: number;
}

const SOMMAIRE_ITEMS: {
  anchor: string;
  label: string;
  key: keyof SommaireCounts;
}[] = [
  { anchor: "parcours", label: "Parcours", key: "parcours" },
  { anchor: "competences", label: "Compétences", key: "competences" },
  { anchor: "formation", label: "Formation", key: "formation" },
  { anchor: "langues", label: "Langues", key: "langues" },
];

function RailBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-line pt-4">
      <p className="j-overline mb-2.5">{label}</p>
      {children}
    </div>
  );
}

export function ProfileRail({
  profile,
  hasExperience,
  hasSkill,
  counts,
  isEmpty,
  importVisible,
  onToggleImport,
}: {
  profile: CandidateProfile;
  hasExperience: boolean;
  hasSkill: boolean;
  counts: SommaireCounts;
  isEmpty: boolean;
  importVisible: boolean;
  onToggleImport: () => void;
}) {
  const checks = profileCompletionChecks(profile, { hasExperience, hasSkill });
  const completion = completionPercent(checks);
  const missing = checks.filter((c) => !c.done);

  return (
    <aside className="w-full shrink-0 lg:sticky lg:top-[calc(var(--app-bar-h)+1.5rem)] lg:w-[264px]">
      <nav aria-label="Sommaire">
        <p className="j-overline mb-2.5">Sommaire</p>
        <ul className="space-y-0.5">
          {SOMMAIRE_ITEMS.map((item) => (
            <li key={item.anchor}>
              <Link
                href={`#${item.anchor}`}
                className="flex items-center justify-between rounded-[5px] px-2 py-1.5 text-[13.5px] text-ink-2 transition-colors hover:bg-accent-soft-2 hover:text-ink"
              >
                <span>{item.label}</span>
                <span className="font-mono text-[11.5px] tabular-nums text-ink-3">
                  {counts[item.key]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-4 space-y-4">
        <RailBlock label="Complétude">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] text-ink-2">
              {completion === 100 ? "Profil complet" : "En cours"}
            </span>
            <span className="font-mono text-[13px] font-medium tabular-nums">
              {completion}%
            </span>
          </div>
          <div className="h-[6px] overflow-hidden rounded-[3px] border border-line bg-paper-3">
            <i
              className="block h-full bg-primary transition-all"
              style={{ width: `${completion}%` }}
            />
          </div>
          {missing.length > 0 && (
            <p className="mt-2 text-[12px] leading-snug text-ink-3">
              À compléter : {missing.map((c) => c.label).join(", ")}
            </p>
          )}
        </RailBlock>

        <RailBlock label="Visibilité & accès">
          <p className="text-[12.5px] leading-snug text-ink-2">
            Les organisations autorisées voient ce profil selon votre
            consentement.
          </p>
          <Link
            href="/candidate/access"
            className="mt-2 inline-block text-[13px] font-medium text-primary underline-offset-2 hover:underline"
          >
            Gérer les accès
          </Link>
        </RailBlock>

        {!isEmpty && (
          <RailBlock label="Import">
            <button
              type="button"
              onClick={onToggleImport}
              aria-expanded={importVisible}
              className="flex w-full items-center gap-2 rounded-[6px] border border-dashed border-line-strong px-3 py-2 text-left text-[13px] text-ink-2 transition-colors hover:border-accent-line hover:text-ink"
            >
              <Upload className="size-4 shrink-0" strokeWidth={1.6} />
              {importVisible ? "Masquer l'import de CV" : "Importer un CV"}
            </button>
          </RailBlock>
        )}
      </div>
    </aside>
  );
}
