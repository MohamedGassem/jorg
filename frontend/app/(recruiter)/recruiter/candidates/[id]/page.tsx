"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Eye, FolderOpen, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Breadcrumb } from "@/components/breadcrumb";
import { DossierGenerationDialog } from "@/components/dossier-generation-dialog";
import { DossierAdaptedEditor } from "@/components/dossier-adapted-editor";
import { StatusPill } from "@/components/ui/StatusPill";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useRecruiterOrg } from "@/lib/hooks";
import {
  AVAILABILITY_LABELS,
  WORK_MODE_LABELS,
  frMonthYear,
  initialsFromName,
  labelFor,
} from "@/lib/labels";
import type {
  AccessibleCandidateDetail,
  Experience,
  OpportunityRead,
} from "@/types/api";

function candidateName(c: AccessibleCandidateDetail): string {
  return c.first_name && c.last_name
    ? `${c.first_name} ${c.last_name}`
    : c.email;
}

function FicheSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-[22px] pb-3.5 pt-4">
        <h2 className="font-heading text-[17px] font-semibold">{title}</h2>
        {count != null && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-accent-line bg-accent-soft px-1.5 font-mono text-[11px] font-medium text-primary">
            {count}
          </span>
        )}
      </div>
      <div className="px-[22px] pb-5 pt-4">{children}</div>
    </section>
  );
}

function ExperienceBlock({ exp }: { exp: Experience }) {
  return (
    <div className="flex gap-3.5">
      <span className="grid size-[38px] shrink-0 place-items-center rounded-[7px] border border-line bg-paper-2 font-heading text-[13px] font-semibold text-ink-2">
        {initialsFromName(exp.client_name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">
          {exp.client_name} — {exp.role}
        </p>
        <p className="j-meta mt-0.5">
          {frMonthYear(exp.start_date)}
          {exp.end_date
            ? ` → ${frMonthYear(exp.end_date)}`
            : exp.is_current
              ? " → aujourd'hui"
              : ""}
        </p>
        {exp.description && (
          <p className="mt-1.5 text-[13.5px] text-ink-2">{exp.description}</p>
        )}
        {exp.achievements.map((ach) => (
          <div
            key={ach.id}
            className="mt-2.5 rounded-md border border-line bg-paper-2 px-3.5 py-3"
          >
            <p className="text-[13.5px] font-semibold">{ach.description}</p>
            {ach.impact && (
              <p className="mt-0.5 text-[13px] text-ink-2">{ach.impact}</p>
            )}
            {ach.skill_tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ach.skill_tags.map((tag) => (
                  <span
                    key={tag.skill_ref_id}
                    className="inline-flex h-[22px] items-center rounded-[5px] border border-accent-line bg-accent-soft-2 px-2 font-mono text-[11px] font-medium text-primary"
                  >
                    {tag.skill_ref.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CandidateDetailPage() {
  const { id: candidateId } = useParams<{ id: string }>();
  const { orgId, loading: orgLoading } = useRecruiterOrg();
  const [candidate, setCandidate] = useState<AccessibleCandidateDetail | null>(
    null,
  );
  const [opportunities, setOpportunities] = useState<OpportunityRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [adaptedOpen, setAdaptedOpen] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [pickingOpp, setPickingOpp] = useState(false);
  const [addFeedback, setAddFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    Promise.all([
      api
        .get<AccessibleCandidateDetail>(
          `/organizations/${orgId}/candidates/${candidateId}`,
        )
        .then((detail) => setCandidate(detail)),
      api
        .get<OpportunityRead[]>(`/organizations/${orgId}/opportunities`)
        .then((opps) =>
          setOpportunities(opps.filter((o) => o.status === "open")),
        ),
    ]).catch((err) =>
      setError(extractErrorMessage(err, "Erreur de chargement")),
    );
  }, [orgId, candidateId]);

  async function handleAddToOpportunity(oppId: string) {
    if (!orgId || !candidateId) return;
    setAddingTo(oppId);
    try {
      await api.post(
        `/organizations/${orgId}/opportunities/${oppId}/candidates`,
        { candidate_id: candidateId },
      );
      setAddFeedback("Candidat ajouté à la mission.");
      setPickingOpp(false);
    } catch (err) {
      setAddFeedback(extractErrorMessage(err, "Erreur"));
    } finally {
      setAddingTo(null);
    }
  }

  if (orgLoading) return <p className="text-ink-3">Chargement…</p>;
  if (error) return <ErrorAlert error={error} />;
  if (!candidate) return <p className="text-ink-3">Chargement…</p>;

  const name = candidateName(candidate);
  const availabilityLabel = labelFor(
    AVAILABILITY_LABELS,
    candidate.availability_status,
  );
  const workModeLabel = labelFor(WORK_MODE_LABELS, candidate.work_mode);

  const skillMap = new Map<string, string>();
  for (const exp of candidate.experiences) {
    for (const usage of exp.skill_usages) {
      if (!skillMap.has(usage.skill_ref_id)) {
        skillMap.set(usage.skill_ref_id, usage.skill_ref.name);
      }
    }
  }
  const skills = Array.from(skillMap.values());

  const metaLine = [
    availabilityLabel,
    workModeLabel,
    candidate.daily_rate ? `${candidate.daily_rate} €/j` : null,
    candidate.annual_salary ? `${candidate.annual_salary} €/an` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const declaredSkills = candidate.candidate_skills;
  const contactItems = [
    candidate.phone ? { label: "Téléphone", value: candidate.phone } : null,
    candidate.email_contact
      ? { label: "Email", value: candidate.email_contact }
      : null,
  ].filter((item): item is { label: string; value: string } => item !== null);

  return (
    <div className="flex w-full flex-col">
      <Breadcrumb
        items={[
          { label: "Candidats", href: "/recruiter/candidates" },
          { label: name },
        ]}
        trailing={
          <span className="j-meta flex items-center gap-1.5 text-[11.5px]">
            <Eye className="size-[13px]" strokeWidth={1.6} />
            Accès journalisé côté candidat
          </span>
        }
      />

      <DossierGenerationDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        target={{
          kind: "recruiter",
          orgId: orgId!,
          candidateId,
          candidateName: name,
        }}
      />

      <DossierAdaptedEditor
        open={adaptedOpen}
        onOpenChange={setAdaptedOpen}
        target={{
          kind: "recruiter",
          orgId: orgId!,
          candidateId,
          candidateName: name,
        }}
        experiences={candidate.experiences.map((e) => ({
          id: e.id,
          role: e.role,
          client_name: e.client_name,
        }))}
        skills={candidate.candidate_skills.map((s) => ({
          id: s.id,
          name: s.skill_ref.name,
        }))}
      />

      <div className="mx-auto grid w-full max-w-[1040px] grid-cols-1 items-start gap-5 pt-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Colonne dossier */}
        <div className="flex min-w-0 flex-col gap-[18px]">
          {/* Identité */}
          <section className="rounded-lg border border-line bg-surface px-[26px] py-[22px]">
            <div className="flex items-start gap-4">
              <span className="grid size-[46px] shrink-0 place-items-center rounded-[10px] border border-accent-line bg-accent-soft font-heading text-[19px] font-semibold text-primary">
                {initialsFromName(name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-heading text-[22px] font-semibold leading-tight">
                    {name}
                  </h1>
                  <StatusPill tone="positive">accès autorisé</StatusPill>
                </div>
                <p className="mt-0.5 text-[14.5px] text-ink-2">
                  {[candidate.title, candidate.location_preference]
                    .filter(Boolean)
                    .join(" · ") || "Profil candidat"}
                </p>
                {metaLine && <p className="j-meta mt-1.5">{metaLine}</p>}
              </div>
            </div>
            {candidate.summary && (
              <p className="mt-4 text-[14px] leading-relaxed text-ink-2">
                {candidate.summary}
              </p>
            )}
            {contactItems.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-line pt-3.5">
                {contactItems.map((item) => (
                  <span key={item.label} className="text-[13px] text-ink-2">
                    <span className="j-meta">{item.label} : </span>
                    {item.value}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Compétences mobilisées (issues des expériences) */}
          {skills.length > 0 && (
            <FicheSection title="Compétences" count={skills.length}>
              <div className="flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex h-7 items-center rounded-md border border-line-2 bg-paper-2 px-3 text-[13px] font-medium text-ink-2"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </FicheSection>
          )}

          {/* Compétences déclarées */}
          {declaredSkills.length > 0 && (
            <FicheSection
              title="Compétences déclarées"
              count={declaredSkills.length}
            >
              <div className="flex flex-wrap gap-2">
                {declaredSkills.map((sk) => (
                  <span
                    key={sk.id}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-2 bg-paper-2 px-3 text-[13px] font-medium text-ink-2"
                  >
                    {sk.skill_ref.name}
                    {sk.self_assessed_level && (
                      <span className="j-meta text-[11px]">
                        {sk.self_assessed_level}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </FicheSection>
          )}

          {/* Expériences */}
          {candidate.experiences.length > 0 && (
            <FicheSection
              title="Expériences"
              count={candidate.experiences.length}
            >
              <div className="flex flex-col gap-[18px]">
                {candidate.experiences.map((exp) => (
                  <ExperienceBlock key={exp.id} exp={exp} />
                ))}
              </div>
            </FicheSection>
          )}

          {/* Formations */}
          {candidate.education.length > 0 && (
            <FicheSection title="Formations" count={candidate.education.length}>
              <div className="flex flex-col gap-3">
                {candidate.education.map((edu) => (
                  <div key={edu.id}>
                    <p className="text-[14px] font-semibold">
                      {[edu.degree, edu.field_of_study]
                        .filter(Boolean)
                        .join(" · ") || edu.school}
                    </p>
                    <p className="j-meta mt-0.5">
                      {edu.school}
                      {edu.end_date ? ` · ${frMonthYear(edu.end_date)}` : ""}
                    </p>
                    {edu.description && (
                      <p className="mt-1 text-[13px] text-ink-2">
                        {edu.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </FicheSection>
          )}

          {/* Certifications */}
          {candidate.certifications.length > 0 && (
            <FicheSection
              title="Certifications"
              count={candidate.certifications.length}
            >
              <div className="flex flex-col gap-3">
                {candidate.certifications.map((cert) => (
                  <div key={cert.id}>
                    <p className="text-[14px] font-semibold">{cert.name}</p>
                    <p className="j-meta mt-0.5">
                      {cert.issuer}
                      {cert.issue_date
                        ? ` · ${frMonthYear(cert.issue_date)}`
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            </FicheSection>
          )}

          {/* Langues */}
          {candidate.languages.length > 0 && (
            <FicheSection title="Langues" count={candidate.languages.length}>
              <div className="flex flex-wrap gap-2">
                {candidate.languages.map((lang) => (
                  <span
                    key={lang.id}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-2 bg-paper-2 px-3 text-[13px] font-medium text-ink-2"
                  >
                    {lang.name}
                    <span className="j-meta text-[11px]">{lang.level}</span>
                  </span>
                ))}
              </div>
            </FicheSection>
          )}
        </div>

        {/* Panneau d'action */}
        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-[calc(var(--app-bar-h)+1rem)]">
          <section className="rounded-lg border border-accent-line bg-accent-soft-2 px-[22px] py-5">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg border border-accent-line bg-accent-soft text-primary">
                <FolderOpen className="size-4" strokeWidth={1.6} />
              </span>
              <h2 className="font-heading text-base font-semibold">
                Générer un dossier
              </h2>
            </div>
            <p className="mb-3.5 text-[13px] leading-relaxed text-ink-2">
              Composez un dossier ciblé sur un poste à partir des données de{" "}
              {candidate.first_name ?? "ce candidat"}.
            </p>
            <Button
              className="w-full justify-center"
              onClick={() => setGenerateOpen(true)}
            >
              <Plus className="size-4" strokeWidth={1.6} />
              Composer un dossier
            </Button>
            <Button
              variant="outline"
              className="mt-2 w-full justify-center"
              onClick={() => setAdaptedOpen(true)}
            >
              Créer une version adaptée
            </Button>
          </section>

          <section className="rounded-lg border border-line bg-surface px-[22px] py-[18px]">
            <p className="j-overline text-[10.5px]">Mission</p>
            <div className="mt-3 space-y-2">
              {addFeedback && (
                <p className="text-xs text-ink-3">{addFeedback}</p>
              )}
              {pickingOpp ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-ink-3">
                    Choisir une mission pour contextualiser ce profil :
                  </p>
                  {opportunities.length === 0 ? (
                    <p className="text-xs text-ink-3">
                      Aucune mission ouverte. Créez une mission pour relier ce
                      profil à un besoin client.
                    </p>
                  ) : (
                    opportunities.map((opp) => (
                      <Button
                        key={opp.id}
                        size="sm"
                        variant="outline"
                        className="w-full justify-start text-xs"
                        disabled={addingTo === opp.id}
                        onClick={() => handleAddToOpportunity(opp.id)}
                      >
                        {opp.title}
                      </Button>
                    ))
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs"
                    onClick={() => setPickingOpp(false)}
                  >
                    Annuler
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-center"
                  onClick={() => {
                    setPickingOpp(true);
                    setAddFeedback(null);
                  }}
                >
                  + Ajouter à une mission
                </Button>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-surface px-[22px] py-[18px]">
            <p className="j-overline text-[10.5px]">Votre accès</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="j-meta text-xs">Accordé par</span>
              <span className="text-[13px] font-medium">le candidat</span>
            </div>
            <hr className="my-4 border-line" />
            <p className="j-meta flex gap-2 text-[11.5px] leading-relaxed">
              <ShieldCheck className="size-3.5 shrink-0" strokeWidth={1.6} />
              Le candidat peut retirer cet accès à tout moment. Les dossiers que
              vous générez figurent dans son journal.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
