// Rail droit collant de "Mon profil" (plan refonte-ui-mon-dossier.md, tranche 3,
// décision 4). Sommaire avec compteurs + ancres de saut, lisibilité recruteur
// (tranche 4, remplace la complétude en %), résumé visibilité / consentement,
// et l'entrée repliée d'import de CV (le flux complet se déploie dans la colonne
// de lecture).
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Upload } from "lucide-react";
import { profileReadability } from "@/lib/completion";
import { cn } from "@/lib/utils";
import type {
  CandidateProfile,
  CandidateSkillProjection,
  Experience,
  Skill,
} from "@/types/api";

const READABILITY_DOT: Record<string, string> = {
  ready: "bg-positive",
  good: "bg-warn",
  hard: "bg-warn",
};

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

// Section active = la dernière dont le haut a franchi la ligne de lecture
// (`threshold` px depuis le haut du viewport). En bas de page, la dernière
// section l'emporte même si elle est trop courte pour atteindre la ligne.
export function pickActiveSection(
  tops: number[],
  threshold: number,
  atBottom: boolean,
): number {
  if (tops.length === 0) return -1;
  if (atBottom) return tops.length - 1;
  let active = 0;
  tops.forEach((top, i) => {
    if (top <= threshold) active = i;
  });
  return active;
}

function useActiveSection(anchors: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const sections = anchors
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null);
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      const index = pickActiveSection(
        sections.map((el) => el.getBoundingClientRect().top),
        window.innerHeight * 0.35,
        atBottom,
      );
      setActive(index >= 0 ? sections[index].id : null);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [anchors]);

  return active;
}

const SOMMAIRE_ANCHORS = SOMMAIRE_ITEMS.map((item) => item.anchor);

function RailBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-line-strong pt-4">
      <p className="j-overline mb-2.5 text-ink-2">{label}</p>
      {children}
    </div>
  );
}

export function ProfileRail({
  profile,
  experiences,
  skills,
  projection,
  counts,
  isEmpty,
  importVisible,
  onToggleImport,
}: {
  profile: CandidateProfile;
  experiences: Experience[];
  skills: Skill[];
  projection: CandidateSkillProjection[];
  counts: SommaireCounts;
  isEmpty: boolean;
  importVisible: boolean;
  onToggleImport: () => void;
}) {
  const readability = profileReadability(
    profile,
    experiences,
    skills,
    projection,
  );
  const activeAnchor = useActiveSection(SOMMAIRE_ANCHORS);

  return (
    <aside className="w-full shrink-0 rounded-xl border border-line-strong bg-card p-4 shadow-sm lg:sticky lg:top-[calc(var(--app-bar-h)+1.5rem)] lg:w-[264px]">
      <nav aria-label="Sommaire">
        <p className="j-overline mb-2.5 text-ink-2">Sommaire</p>
        <ul className="space-y-0.5">
          {SOMMAIRE_ITEMS.map((item) => {
            const isActive = item.anchor === activeAnchor;
            return (
              <li key={item.anchor}>
                <Link
                  href={`#${item.anchor}`}
                  aria-current={isActive ? "location" : undefined}
                  className={cn(
                    "flex items-center justify-between rounded-[5px] border-l-2 px-2 py-1.5 text-[13.5px] transition-colors",
                    isActive
                      ? "border-primary bg-accent-soft font-medium text-ink"
                      : "border-transparent text-ink hover:bg-accent-soft-2",
                  )}
                >
                  <span>{item.label}</span>
                  <span className="rounded-full bg-accent-soft px-1.5 font-sans text-[11.5px] font-medium tabular-nums text-primary">
                    {counts[item.key]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-4 space-y-4">
        <RailBlock label="Lisibilité recruteur">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                READABILITY_DOT[readability.level],
              )}
              aria-hidden
            />
            <span className="text-[13px] font-medium text-ink">
              {readability.statusLabel}
            </span>
          </div>
          {readability.actions.length > 0 && (
            <>
              <p className="j-overline mb-1.5 mt-3 text-ink-2">À améliorer</p>
              <ul className="space-y-1.5">
                {readability.actions.map((action) => (
                  <li
                    key={action}
                    className="flex gap-1.5 text-[12.5px] leading-snug text-ink-2"
                  >
                    <span className="mt-0.5 text-ink-3" aria-hidden>
                      ·
                    </span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </>
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
