"use client";

import { useEffect, useState } from "react";
import { FileText, Mail, Sparkles, Users } from "lucide-react";
import { QuickActionCard } from "@/components/ui/QuickActionCard";
import { StatCard } from "@/components/ui/StatCard";
import { api } from "@/lib/api";
import { useRecruiterOrg } from "@/lib/hooks";
import type {
  AccessibleCandidateRead,
  GeneratedDocument,
  Invitation,
  OpportunityRead,
} from "@/types/api";

function relativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "il y a 1j";
  return `il y a ${days}j`;
}

export default function RecruiterDashboardPage() {
  const { orgId, profile, loading: orgLoading } = useRecruiterOrg();

  const [candidateCount, setCandidateCount] = useState<number | null>(null);
  const [openOpportunityCount, setOpenOpportunityCount] = useState<
    number | null
  >(null);
  const [pendingInvitationCount, setPendingInvitationCount] = useState<
    number | null
  >(null);
  const [docCount, setDocCount] = useState<number | null>(null);
  const [recentDocs, setRecentDocs] = useState<GeneratedDocument[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) {
      setDataLoading(false);
      return;
    }

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
      .get<GeneratedDocument[]>(`/organizations/${orgId}/documents`)
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
  }, [orgId, orgLoading]);

  if (orgLoading || dataLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-64 rounded-lg bg-muted" />
        <div className="h-5 w-80 rounded-lg bg-muted" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted" />
          ))}
        </div>
        <div className="h-6 w-40 rounded-lg bg-muted" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Vous n&apos;êtes pas encore rattaché à une organisation.
        </p>
      </div>
    );
  }

  const firstName = profile?.first_name ?? "";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">
          Bonjour{firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aperçu de votre activité recrutement
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Candidats accessibles"
          value={candidateCount !== null ? candidateCount : "—"}
          subtitle="Accessibles"
          color="primary"
        />
        <StatCard
          label="Opportunités ouvertes"
          value={openOpportunityCount !== null ? openOpportunityCount : "—"}
          subtitle="Ouvertes"
          color="emerald"
        />
        <StatCard
          label="Invitations en attente"
          value={pendingInvitationCount !== null ? pendingInvitationCount : "—"}
          subtitle="En attente"
          color="amber"
        />
        <StatCard
          label="Dossiers générés"
          value={docCount !== null ? docCount : "—"}
          subtitle="Ce mois"
          color="neutral"
        />
      </div>

      <section>
        <h2 className="mb-4 text-base font-semibold">Actions rapides</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <QuickActionCard
            icon={Mail}
            label="Inviter un candidat"
            description="Envoyer une invitation par email"
            href="/recruiter/invitations"
          />
          <QuickActionCard
            icon={Sparkles}
            label="Générer un dossier"
            description="Créer un dossier candidat"
            href="/recruiter/generate"
          />
          <QuickActionCard
            icon={Users}
            label="Voir les candidats"
            description={
              candidateCount !== null
                ? `${candidateCount} profil${candidateCount > 1 ? "s" : ""} accessible${candidateCount > 1 ? "s" : ""}`
                : "Voir les profils accessibles"
            }
            href="/recruiter/candidates"
          />
        </div>
      </section>

      {recentDocs.length > 0 && (
        <section>
          <h2 className="mb-4 text-base font-semibold">Dossiers récents</h2>
          <ul className="space-y-2">
            {recentDocs.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <FileText
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="text-sm text-foreground">
                    Dossier {doc.file_format.toUpperCase()}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {relativeDate(doc.generated_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
