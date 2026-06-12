"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  Clock,
  FolderOpen,
  Plus,
  Users,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { OnboardingOrg } from "@/components/onboarding-org";
import { StatCell } from "@/components/ui/StatCell";
import { StatusPill } from "@/components/ui/StatusPill";
import { api } from "@/lib/api";
import { useRecruiterWorkspace } from "@/components/recruiter-workspace";
import { cn } from "@/lib/utils";
import type {
  AccessibleCandidateRead,
  GeneratedDocumentRecruiterView,
  Invitation,
  OpportunityRead,
} from "@/types/api";
import {
  AVAILABILITY_LABELS,
  WORK_MODE_LABELS,
  initialsFromParts,
  labelFor,
  relativeDate,
} from "@/lib/labels";

export default function RecruiterDashboardPage() {
  const router = useRouter();
  const { orgId, org, profile, loading: orgLoading } = useRecruiterWorkspace();

  useEffect(() => {
    if (orgLoading) return;
    if (profile && !profile.onboarding_completed) {
      router.replace("/onboarding/recruiter/organization");
    }
  }, [profile, orgLoading, router]);

  const [candidates, setCandidates] = useState<AccessibleCandidateRead[]>([]);
  const [openOpportunityCount, setOpenOpportunityCount] = useState<
    number | null
  >(null);
  const [pendingInvitationCount, setPendingInvitationCount] = useState<
    number | null
  >(null);
  const [docCount, setDocCount] = useState<number | null>(null);
  const [recentDocs, setRecentDocs] = useState<
    GeneratedDocumentRecruiterView[]
  >([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (orgLoading || !profile?.onboarding_completed) return;
    if (!orgId) return;

    const candidatesPromise = api
      .get<AccessibleCandidateRead[]>(`/organizations/${orgId}/candidates`)
      .catch(() => null);

    const opportunitiesPromise = api
      .get<OpportunityRead[]>(`/organizations/${orgId}/opportunities`)
      .catch(() => null);

    const invitationsPromise = api
      .get<Invitation[]>(`/organizations/${orgId}/invitations`)
      .catch(() => null);

    const documentsPromise = api
      .get<
        GeneratedDocumentRecruiterView[]
      >(`/organizations/${orgId}/documents`)
      .catch(() => null);

    Promise.all([
      candidatesPromise,
      opportunitiesPromise,
      invitationsPromise,
      documentsPromise,
    ]).then(([candidatesData, opportunities, invitations, documents]) => {
      if (candidatesData !== null) {
        setCandidates(candidatesData);
      }
      if (opportunities !== null) {
        setOpenOpportunityCount(
          opportunities.filter((o) => o.status === "open").length,
        );
      }
      if (invitations !== null) {
        setPendingInvitationCount(
          invitations.filter((inv) => inv.status === "pending").length,
        );
      }
      if (documents !== null) {
        setDocCount(documents.length);
        const sorted = [...documents].sort(
          (a, b) =>
            new Date(b.generated_at).getTime() -
            new Date(a.generated_at).getTime(),
        );
        setRecentDocs(sorted.slice(0, 4));
      }
      setDataLoading(false);
    });
  }, [orgId, orgLoading, profile, profile?.onboarding_completed]);

  if (orgLoading || (!!orgId && dataLoading)) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="space-y-3">
          <div className="h-3 w-56 rounded bg-muted" />
          <div className="h-8 w-64 rounded-lg bg-muted" />
          <div className="h-4 w-96 rounded-lg bg-muted" />
        </div>
        <div className="grid grid-cols-1 gap-px sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-lg bg-muted" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.7fr_1fr]">
          <div className="h-[420px] rounded-lg bg-muted" />
          <div className="h-[420px] rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="space-y-6">
        <header>
          <p className="j-overline">Espace recruteur</p>
          <h1 className="mt-2 font-heading text-[27px] font-semibold leading-tight">
            Configurer votre organisation
          </h1>
          <p className="mt-1 text-[15px] text-ink-2">
            Votre espace recruteur a besoin d&apos;une organisation pour inviter
            des candidats et générer des dossiers.
          </p>
        </header>
        <OnboardingOrg onSuccess={() => window.location.reload()} />
      </div>
    );
  }

  const firstName = profile?.first_name ?? "";
  const candidateCount = candidates.length;
  const pendingCount = pendingInvitationCount ?? 0;
  const lead =
    candidateCount > 0
      ? `${candidateCount} candidat${candidateCount > 1 ? "s" : ""} vous ${candidateCount > 1 ? "ont" : "a"} accordé l'accès.${
          pendingCount > 0
            ? ` ${pendingCount} demande${pendingCount > 1 ? "s" : ""} en attente de réponse.`
            : ""
        }`
      : "Commencez par obtenir l'accord d'un candidat pour exploiter son dossier.";

  return (
    <div className="flex w-full flex-col gap-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="j-overline">
            {org?.name ?? "Espace recruteur"} · portail organisation
          </p>
          <h1 className="mt-2 font-heading text-[27px] font-semibold leading-tight">
            {firstName ? `Bonjour ${firstName}` : "Votre espace recruteur"}
          </h1>
          <p className="mt-1 max-w-[560px] text-[15px] text-ink-2">{lead}</p>
        </div>
        <Link
          href="/recruiter/candidates"
          className={cn(buttonVariants({ variant: "default" }), "w-fit")}
        >
          {candidateCount > 0 ? "Générer un dossier" : "Inviter un candidat"}
        </Link>
      </header>

      <section
        className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Statistiques de l'organisation"
      >
        <StatCell
          icon={Users}
          label="Candidats accessibles"
          value={String(candidateCount)}
          foot="avec accord candidat"
        />
        <StatCell
          icon={Clock}
          label="Demandes en attente"
          value={String(pendingCount)}
          foot={pendingCount > 0 ? "envoyées, sans réponse" : "rien à suivre"}
        />
        <StatCell
          icon={FolderOpen}
          label="Dossiers générés"
          value={String(docCount ?? 0)}
          foot="par votre organisation"
        />
        <StatCell
          icon={BriefcaseBusiness}
          label="Missions ouvertes"
          value={String(openOpportunityCount ?? 0)}
          foot="contextes de besoin client"
        />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.7fr_1fr]">
        {/* Candidats accessibles */}
        <article className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
          <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-[18px]">
            <h2 className="font-heading text-[17px] font-semibold">
              Candidats accessibles
            </h2>
            <div className="flex items-center gap-2">
              {candidateCount > 0 && (
                <StatusPill tone="accent">
                  {candidateCount} dossier{candidateCount > 1 ? "s" : ""}
                </StatusPill>
              )}
              <Link
                href="/recruiter/candidates"
                className="text-[13.5px] font-medium text-ink-3 hover:text-primary"
              >
                Tout voir
              </Link>
            </div>
          </div>
          {candidateCount === 0 ? (
            <div className="mx-5 mb-5 rounded-md border border-dashed border-line-strong bg-paper-2 p-4">
              <p className="text-sm font-medium">
                Aucun candidat accessible pour le moment
              </p>
              <p className="mt-1 text-[12.5px] leading-5 text-ink-3">
                Invitez un candidat : son dossier devient consultable uniquement
                après son accord explicite.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Candidat", "Disponibilité", "Mode", "Exp", ""].map(
                      (label, i) => (
                        <th key={i} className="j-th">
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {candidates.slice(0, 6).map((candidate) => (
                    <tr
                      key={candidate.user_id}
                      className="relative border-b border-line last:border-b-0 hover:bg-paper-2"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-[11px]">
                          <span className="grid size-8 place-items-center rounded-lg border border-accent-line bg-accent-soft font-heading text-[12.5px] font-semibold text-primary">
                            {initialsFromParts(
                              candidate.first_name,
                              candidate.last_name,
                            )}
                          </span>
                          <div className="min-w-0">
                            <Link
                              href={`/recruiter/candidates/${candidate.user_id}`}
                              className="whitespace-nowrap text-sm font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {[candidate.first_name, candidate.last_name]
                                .filter(Boolean)
                                .join(" ") || candidate.email}
                            </Link>
                            {candidate.title && (
                              <p className="text-xs text-ink-3">
                                {candidate.title}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="j-meta text-[12.5px]">
                          {labelFor(
                            AVAILABILITY_LABELS,
                            candidate.availability_status,
                          ) ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="j-meta text-[12.5px]">
                          {labelFor(WORK_MODE_LABELS, candidate.work_mode) ??
                            "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="j-meta text-[12.5px]">
                          {candidate.experiences.length}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="whitespace-nowrap text-[13.5px] font-medium text-ink-3">
                          Consulter
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        {/* Rail droit */}
        <div className="flex min-w-0 flex-col gap-5">
          <article className="rounded-lg border border-accent-line bg-accent-soft-2 px-[22px] py-5">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg border border-accent-line bg-accent-soft text-primary">
                <FolderOpen className="size-4" strokeWidth={1.6} />
              </span>
              <h2 className="font-heading text-[16.5px] font-semibold">
                Générer un dossier ciblé
              </h2>
            </div>
            <p className="mb-4 text-[13.5px] leading-relaxed text-ink-2">
              Choisissez un candidat et un poste : Jorg compose un dossier sur
              mesure à partir de ses données vérifiées.
            </p>
            <Link
              href="/recruiter/candidates"
              className={cn(
                buttonVariants({ variant: "default" }),
                "w-full justify-center",
              )}
            >
              <Plus className="size-4" strokeWidth={1.6} />
              Composer un dossier
            </Link>
          </article>

          <article className="flex flex-1 flex-col rounded-lg border border-line bg-surface px-[22px] py-5">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <h2 className="font-heading text-[17px] font-semibold">
                Journal de l&apos;équipe
              </h2>
              <Link
                href="/recruiter/documents"
                className="text-[13.5px] font-medium text-ink-3 hover:text-primary"
              >
                Tout voir
              </Link>
            </div>
            {recentDocs.length === 0 ? (
              <p className="py-3 text-sm text-ink-3">
                Les dossiers générés par votre organisation apparaîtront ici.
              </p>
            ) : (
              <div className="flex flex-col">
                {recentDocs.map((doc, i) => (
                  <Link
                    key={doc.id}
                    href="/recruiter/documents"
                    className="group relative flex gap-3.5 py-3.5"
                  >
                    {i < recentDocs.length - 1 && (
                      <span
                        className="absolute bottom-[-2px] left-3.5 top-8 w-px bg-line"
                        aria-hidden
                      />
                    )}
                    <span className="z-10 grid size-[29px] shrink-0 place-items-center rounded-lg border border-accent-line bg-accent-soft text-primary">
                      <FolderOpen className="size-3.5" strokeWidth={1.6} />
                    </span>
                    <span className="min-w-0 pt-0.5">
                      <span className="block text-sm group-hover:text-primary">
                        <b className="font-semibold">
                          {[doc.candidate_first_name, doc.candidate_last_name]
                            .filter(Boolean)
                            .join(" ") || "Candidat"}
                        </b>{" "}
                        · Dossier généré
                        {doc.template_name ? ` — ${doc.template_name}` : ""}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11.5px] text-ink-4">
                        {relativeDate(doc.generated_at)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <p className="j-meta mt-auto flex items-center gap-2 pt-3 text-[11.5px]">
              Chaque consultation est tracée côté candidat.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
