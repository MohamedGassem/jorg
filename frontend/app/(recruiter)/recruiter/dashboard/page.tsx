"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { OnboardingOrg } from "@/components/onboarding-org";
import { NotificationBell } from "@/components/notification-bell";
import { api } from "@/lib/api";
import { useRecruiterOrg } from "@/lib/hooks";
import type {
  AccessibleCandidateRead,
  GeneratedDocumentRecruiterView,
  Invitation,
  OpportunityRead,
} from "@/types/api";
import { relativeDate } from "@/lib/labels";

export default function RecruiterDashboardPage() {
  const router = useRouter();
  const { orgId, profile, loading: orgLoading } = useRecruiterOrg();

  useEffect(() => {
    if (orgLoading) return;
    if (profile && !profile.onboarding_completed) {
      router.replace("/onboarding/recruiter/organization");
    }
  }, [profile, orgLoading, router]);

  const [candidateCount, setCandidateCount] = useState<number | null>(null);
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
    ]).then(([candidates, opportunities, invitations, documents]) => {
      if (candidates !== null) {
        setCandidateCount(candidates.length);
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
        setRecentDocs(sorted.slice(0, 3));
      }
      setDataLoading(false);
    });
  }, [orgId, orgLoading, profile, profile?.onboarding_completed]);

  if (orgLoading || (!!orgId && dataLoading)) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-72 rounded-lg bg-muted" />
        <div className="h-5 w-96 rounded-lg bg-muted" />
        <div className="h-40 rounded-lg bg-muted" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Configurer votre organisation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Votre espace recruteur a besoin d&apos;une organisation pour inviter
            des candidats et générer des dossiers.
          </p>
        </div>
        <OnboardingOrg onSuccess={() => window.location.reload()} />
      </div>
    );
  }

  const firstName = profile?.first_name ?? "";
  const hasCandidates = (candidateCount ?? 0) > 0;
  const hasOpenMissions = (openOpportunityCount ?? 0) > 0;
  const hasDocs = (docCount ?? 0) > 0;
  const primaryAction = !hasCandidates
    ? {
        title: "Inviter un candidat autorisé",
        description:
          "Commencez par obtenir l'accord d'un candidat avant de générer un dossier.",
        href: "/recruiter/candidates",
        cta: "Inviter un candidat",
      }
    : !hasOpenMissions
      ? {
          title: "Créer une mission",
          description:
            "Ajoutez le contexte client pour relier les candidats autorisés à un besoin.",
          href: "/recruiter/opportunities",
          cta: "Créer une mission",
        }
      : {
          title: "Générer un dossier candidat",
          description:
            "Choisissez un candidat autorisé et un modèle de dossier adapté.",
          href: "/recruiter/candidates",
          cta: "Générer un dossier",
        };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Accueil recruteur</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {firstName ? `${firstName}, suivez` : "Suivez"} le passage des
            candidats autorisés aux missions, puis aux dossiers générés.
          </p>
        </div>
        <NotificationBell portal="recruiter" orgId={orgId} />
      </div>

      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Prochaine action
            </p>
            <h2 className="mt-2 font-heading text-xl font-semibold">
              {primaryAction.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {primaryAction.description}
            </p>
          </div>
          <Link href={primaryAction.href}>
            <Button>{primaryAction.cta}</Button>
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-heading text-base font-semibold">
            Candidats autorisés
          </h2>
          <p className="mt-4 text-3xl font-semibold text-primary">
            {candidateCount !== null ? candidateCount : "-"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            profil{candidateCount === 1 ? "" : "s"} exploitable
            {candidateCount === 1 ? "" : "s"} avec accord candidat.
          </p>
          <div className="mt-4">
            <Link href="/recruiter/candidates">
              <Button variant="outline" size="sm">
                Voir les candidats
              </Button>
            </Link>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-heading text-base font-semibold">
            Missions ouvertes
          </h2>
          <p className="mt-4 text-3xl font-semibold text-primary">
            {openOpportunityCount !== null ? openOpportunityCount : "-"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            contexte{openOpportunityCount === 1 ? "" : "s"} de besoin client
            prêt{openOpportunityCount === 1 ? "" : "s"} à recevoir des
            candidats.
          </p>
          <div className="mt-4">
            <Link href="/recruiter/opportunities">
              <Button variant="outline" size="sm">
                Gérer les missions
              </Button>
            </Link>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-heading text-base font-semibold">
            Invitations en attente
          </h2>
          <p className="mt-4 text-3xl font-semibold text-warning">
            {pendingInvitationCount !== null ? pendingInvitationCount : "-"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            invitation{pendingInvitationCount === 1 ? "" : "s"} en attente
            d&apos;acceptation.
          </p>
          <div className="mt-4">
            <Link href="/recruiter/candidates">
              <Button variant="outline" size="sm">
                Suivre les invitations
              </Button>
            </Link>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="font-heading text-base font-semibold">
              Dossiers récents
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasDocs
                ? `${docCount} dossier${docCount === 1 ? "" : "s"} généré${docCount === 1 ? "" : "s"} par votre organisation.`
                : "Les dossiers générés depuis les candidats autorisés apparaîtront ici."}
            </p>
          </div>
          <Link href="/recruiter/documents">
            <Button variant="outline" size="sm">
              Ouvrir Dossiers & modèles
            </Button>
          </Link>
        </div>

        {recentDocs.length > 0 && (
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {recentDocs.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-col gap-1 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {[doc.candidate_first_name, doc.candidate_last_name]
                      .filter(Boolean)
                      .join(" ") || "Candidat"}
                  </p>
                  <p className="text-muted-foreground">
                    {doc.template_name ?? "Modèle de dossier"} -{" "}
                    {doc.file_format.toUpperCase()}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {relativeDate(doc.generated_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
