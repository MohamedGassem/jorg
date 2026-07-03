// Mode lecture pleine page (plan refonte-ui-mon-dossier.md, tranche 5 +
// décision 6). Rendu générique du "dossier accessible" : le profil tel qu'un
// recruteur sous accès actif le lit. Densité dense, zéro affordance d'édition,
// bandeau de consentement. Même structure éditoriale que "Mon profil", mais en
// lecture seule : filets + en-têtes registre mono, pas de cartes imbriquées.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { SkillChip } from "@/components/ui/SkillChip";
import { assembleSkillRows, type SkillRow } from "@/lib/skill-proof";
import {
  type DetailedN,
  loadDetailedN,
  sortExperiences,
  yearRange,
} from "@/lib/timeline";
import {
  AVAILABILITY_LABELS,
  CONTRACT_TYPE_LABELS,
  WORK_MODE_LABELS,
  frDate,
  frMonthYear,
  labelFor,
} from "@/lib/labels";
import type {
  CandidateProfile,
  CandidateSkillProjection,
  Certification,
  Education,
  Experience,
  Language,
  Skill,
  SkillKind,
} from "@/types/api";

// Ordre et libellés des types de compétences (miroir de skill-section, figés).
const KIND_ORDER: SkillKind[] = [
  "technical",
  "tool",
  "functional",
  "methodology",
  "sectoral",
  "soft",
];
const KIND_LABELS: Record<SkillKind, string> = {
  technical: "Technique",
  tool: "Outil",
  functional: "Fonctionnel",
  methodology: "Méthodologie",
  sectoral: "Sectoriel",
  soft: "Soft skills",
};

function ReadSection({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line pt-6">
      <div className="mb-4 flex items-baseline gap-2.5">
        <p className="j-overline">{label}</p>
        {count != null && (
          <span className="font-mono text-[11.5px] tabular-nums text-ink-3">
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function ReadSeal({ row }: { row: SkillRow }) {
  return (
    <SkillChip
      label={row.name}
      proof={{ state: row.state, featured: row.featured, count: row.count }}
    />
  );
}

function ReadExperience({ exp }: { exp: Experience }) {
  const dates = exp.is_current
    ? `${frMonthYear(exp.start_date)} → présent`
    : `${frMonthYear(exp.start_date)}${
        exp.end_date ? ` → ${frMonthYear(exp.end_date)}` : ""
      }`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="min-w-0 font-heading text-[15px] font-semibold">
          {exp.role}
        </p>
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-3">
          {dates}
        </span>
      </div>
      {exp.description && (
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">
          {exp.description}
        </p>
      )}
      {exp.achievements.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {exp.achievements.map((ach) => (
            <li key={ach.id} className="flex gap-2 text-[13.5px] leading-snug">
              <span className="mt-0.5 shrink-0 text-ink-3" aria-hidden>
                •
              </span>
              <span className="min-w-0">
                <span className="text-ink">{ach.description}</span>
                {ach.impact && (
                  <span className="text-ink-2"> — {ach.impact}</span>
                )}
                {ach.skill_tags.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {ach.skill_tags.map((tag) => (
                      <span
                        key={tag.skill_ref_id}
                        className="inline-flex h-[20px] items-center rounded-[5px] border border-accent-line bg-accent-soft-2 px-1.5 font-mono text-[10.5px] font-medium text-primary"
                      >
                        {tag.skill_ref.name}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CondensedReadRow({
  exp,
  onExpand,
}: {
  exp: Experience;
  onExpand: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="flex w-full items-baseline gap-3 border-t border-line px-1 py-2 text-left transition-colors hover:bg-accent-soft-2"
    >
      <span className="w-[92px] shrink-0 font-mono text-[12px] tabular-nums text-ink-3">
        {yearRange(exp)}
      </span>
      <span className="min-w-0 text-[13.5px] text-ink-2">
        <span className="font-medium text-ink">{exp.client_name}</span>{" "}
        {exp.role}
      </span>
    </button>
  );
}

function ReadTimeline({ experiences }: { experiences: Experience[] }) {
  const [detailedN, setDetailedN] = useState<DetailedN>(5);
  const [expandAll, setExpandAll] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDetailedN(loadDetailedN());
  }, []);

  const sorted = sortExperiences(experiences);
  const limit = detailedN === "all" ? Infinity : detailedN;
  const classified = sorted.map((exp, index) => ({
    exp,
    detailed: expandAll || index < limit || expandedIds.has(exp.id),
  }));
  const rows = classified.map((row, idx) => {
    const prev = classified[idx - 1];
    const showClientHeader =
      row.detailed &&
      (!prev || !prev.detailed || prev.exp.client_name !== row.exp.client_name);
    return { ...row, showClientHeader };
  });
  const collapsedCount = rows.filter((r) => !r.detailed).length;

  return (
    <div className="space-y-3">
      {rows.map(({ exp, detailed, showClientHeader }) => {
        if (!detailed) {
          return (
            <CondensedReadRow
              key={exp.id}
              exp={exp}
              onExpand={() =>
                setExpandedIds((prev) => new Set(prev).add(exp.id))
              }
            />
          );
        }
        return (
          <div key={exp.id} className="mt-4 first:mt-0">
            {showClientHeader && (
              <p className="mb-1.5 font-heading text-[15px] font-semibold text-ink-2">
                {exp.client_name}
              </p>
            )}
            <ReadExperience exp={exp} />
          </div>
        );
      })}
      {collapsedCount > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setExpandAll(true)}
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            + Tout déplier ({collapsedCount})
          </button>
        </div>
      )}
    </div>
  );
}

function ReadSkills({
  skills,
  projection,
  experiences,
}: {
  skills: Skill[];
  projection: CandidateSkillProjection[];
  experiences: Experience[];
}) {
  const [declaredOpen, setDeclaredOpen] = useState(false);
  const { highlighted, declared } = assembleSkillRows(
    skills,
    projection,
    experiences,
  );
  const declaredByKind = KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABELS[kind],
    rows: declared.filter((r) => r.kind === kind),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-4">
      {highlighted.length > 0 ? (
        <div className="space-y-2">
          <p className="j-overline">Prouvées et clés</p>
          <div className="flex flex-wrap items-center gap-2">
            {highlighted.map((row) => (
              <ReadSeal key={row.id} row={row} />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-ink-3">
          Aucune compétence prouvée pour l&apos;instant.
        </p>
      )}

      {declared.length > 0 && (
        <div className="border-t border-line pt-3">
          <button
            type="button"
            onClick={() => setDeclaredOpen((o) => !o)}
            aria-expanded={declaredOpen}
            className="text-[12.5px] font-medium text-primary hover:underline"
          >
            {declaredOpen ? "− Masquer" : "+"}{" "}
            {declaredOpen
              ? "les compétences déclarées"
              : `${declared.length} autre${
                  declared.length > 1 ? "s" : ""
                } compétence${declared.length > 1 ? "s" : ""} déclarée${
                  declared.length > 1 ? "s" : ""
                }`}
          </button>
          {declaredOpen && (
            <div className="mt-3 space-y-3">
              {declaredByKind.map(({ kind, label, rows }) => (
                <div key={kind} className="space-y-1.5">
                  <p className="j-overline">{label}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {rows.map((row) => (
                      <ReadSeal key={row.id} row={row} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ProfileReadView({
  profile,
  experiences,
  skills,
  projection,
  education,
  certifications,
  languages,
}: {
  profile: CandidateProfile;
  experiences: Experience[];
  skills: Skill[];
  projection: CandidateSkillProjection[];
  education: Education[];
  certifications: Certification[];
  languages: Language[];
}) {
  const fullName =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "—";
  const availabilityLabel =
    profile.availability_status === "available_from" &&
    profile.availability_date
      ? `Disponible le ${frDate(profile.availability_date)}`
      : labelFor(AVAILABILITY_LABELS, profile.availability_status);
  const meta = [
    availabilityLabel,
    labelFor(CONTRACT_TYPE_LABELS, profile.contract_type),
    profile.daily_rate ? `TJM ${profile.daily_rate} €` : null,
    profile.annual_salary
      ? `${profile.annual_salary.toLocaleString("fr-FR")} €/an`
      : null,
    labelFor(WORK_MODE_LABELS, profile.work_mode),
    profile.location,
    profile.years_of_experience ? `${profile.years_of_experience} ans` : null,
  ].filter(Boolean);

  const formationCount = education.length + certifications.length;

  return (
    <div className="mx-auto w-full max-w-[720px]">
      {/* Bandeau consentement (décision 6) */}
      <div className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[6px] border border-line bg-paper-2 px-4 py-3">
        <ShieldCheck className="size-4 shrink-0 text-ink-3" strokeWidth={1.6} />
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink-2">
          Les organisations autorisées voient ce profil selon votre
          consentement.
        </p>
        <Link
          href="/candidate/access"
          className="text-[13px] font-medium text-primary underline-offset-2 hover:underline"
        >
          Gérer les accès
        </Link>
      </div>

      {/* Couverture (lecture seule) */}
      <div className="pb-7">
        <p className="j-overline">Mode lecture</p>
        <h1 className="mt-3 font-heading text-[30px] font-semibold leading-[1.1]">
          {fullName}
        </h1>
        <p className="mt-1.5 font-heading text-[18px] font-medium text-ink-2">
          {[profile.title, profile.location].filter(Boolean).join(" · ") ||
            "Titre et localisation à compléter"}
        </p>
        {meta.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px] text-ink-2">
            {meta.map((item, i) => (
              <span key={i} className="flex items-center gap-3">
                {i > 0 && <span className="text-ink-4">·</span>}
                {item}
              </span>
            ))}
          </div>
        )}
        {profile.summary && (
          <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-ink">
            {profile.summary}
          </p>
        )}
      </div>

      <div className="space-y-6">
        {experiences.length > 0 && (
          <ReadSection label="Parcours" count={experiences.length}>
            <ReadTimeline experiences={experiences} />
          </ReadSection>
        )}

        {skills.length > 0 && (
          <ReadSection label="Compétences" count={skills.length}>
            <ReadSkills
              skills={skills}
              projection={projection}
              experiences={experiences}
            />
          </ReadSection>
        )}

        {formationCount > 0 && (
          <ReadSection label="Formation" count={formationCount}>
            <div className="space-y-3">
              {education.map((edu) => (
                <div key={edu.id}>
                  <p className="font-heading text-[15px] font-semibold">
                    {[edu.degree, edu.field_of_study]
                      .filter(Boolean)
                      .join(" · ") || edu.school}
                  </p>
                  <p className="j-meta mt-0.5">
                    {edu.school}
                    {edu.end_date ? ` · ${frMonthYear(edu.end_date)}` : ""}
                  </p>
                </div>
              ))}
              {certifications.map((cert) => (
                <div key={cert.id}>
                  <p className="font-heading text-[15px] font-semibold">
                    {cert.name}
                  </p>
                  <p className="j-meta mt-0.5">
                    {cert.issuer}
                    {cert.issue_date
                      ? ` · ${frMonthYear(cert.issue_date)}`
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          </ReadSection>
        )}

        {languages.length > 0 && (
          <ReadSection label="Langues" count={languages.length}>
            <div className="flex flex-wrap gap-2">
              {languages.map((lang) => (
                <span
                  key={lang.id}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-2 bg-paper-2 px-3 text-[13px] font-medium text-ink-2"
                >
                  {lang.name}
                  <span className="j-meta text-[11px]">{lang.level}</span>
                </span>
              ))}
            </div>
          </ReadSection>
        )}
      </div>
    </div>
  );
}
