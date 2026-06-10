"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Eye, FolderOpen, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Breadcrumb } from "@/components/breadcrumb";
import { GenerateDossierDialog } from "@/components/generate-dossier-dialog";
import { StatusPill } from "@/components/ui/StatusPill";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useRecruiterOrg } from "@/lib/hooks";
import { AVAILABILITY_LABELS, WORK_MODE_LABELS, labelFor } from "@/lib/labels";
import type {
  AccessibleCandidateRead,
  BuiltinTemplate,
  Experience,
  OpportunityRead,
  Template,
} from "@/types/api";

function candidateName(c: AccessibleCandidateRead): string {
  return c.first_name && c.last_name
    ? `${c.first_name} ${c.last_name}`
    : c.email;
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
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
        {initials(exp.client_name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">
          {exp.client_name} — {exp.role}
        </p>
        <p className="j-meta mt-0.5">
          {exp.start_date}
          {exp.end_date
            ? ` → ${exp.end_date}`
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
  const [candidate, setCandidate] = useState<AccessibleCandidateRead | null>(
    null,
  );
  const [templates, setTemplates] = useState<Template[]>([]);
  const [builtinTemplates, setBuiltinTemplates] = useState<BuiltinTemplate[]>(
    [],
  );
  const [opportunities, setOpportunities] = useState<OpportunityRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [pickingOpp, setPickingOpp] = useState(false);
  const [addFeedback, setAddFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    Promise.all([
      api
        .get<AccessibleCandidateRead[]>(`/organizations/${orgId}/candidates`)
        .then((list) => {
          const found = list.find((c) => c.user_id === candidateId) ?? null;
          setCandidate(found);
          if (!found) setError("Candidat introuvable ou accès non autorisé.");
        }),
      api
        .get<Template[]>(`/organizations/${orgId}/templates`)
        .then(setTemplates),
      api
        .get<BuiltinTemplate[]>("/templates/builtin")
        .then(setBuiltinTemplates),
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
  ]
    .filter(Boolean)
    .join(" · ");

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
            Consultation visible par le candidat
          </span>
        }
      />

      <GenerateDossierDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        orgId={orgId!}
        candidateId={candidateId}
        candidateName={name}
        templates={templates}
        builtinTemplates={builtinTemplates}
      />

      <div className="mx-auto grid w-full max-w-[1040px] grid-cols-1 items-start gap-5 pt-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Colonne dossier */}
        <div className="flex min-w-0 flex-col gap-[18px]">
          {/* Identité */}
          <section className="rounded-lg border border-line bg-surface px-[26px] py-[22px]">
            <div className="flex items-start gap-4">
              <span className="grid size-[46px] shrink-0 place-items-center rounded-[10px] border border-accent-line bg-accent-soft font-heading text-[19px] font-semibold text-primary">
                {initials(name)}
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
          </section>

          {/* Compétences */}
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
        </div>

        {/* Panneau d'action */}
        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-[130px]">
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
              Le candidat peut retirer cet accès à tout moment. Votre
              consultation figure dans son journal.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
