"use client";

import { useEffect, useState } from "react";
import { Mail, Shield, User } from "lucide-react";
import { QuickActionCard } from "@/components/ui/QuickActionCard";
import { StatCard } from "@/components/ui/StatCard";
import { api } from "@/lib/api";
import type {
  CandidateProfile,
  Experience,
  InteractionEvent,
  Invitation,
  OrganizationInteractionCard,
  Skill,
} from "@/types/api";
import { EVENT_LABELS, EVENT_ICONS, relativeDate } from "@/lib/labels";

function calcProfileCompletion(
  profile: CandidateProfile,
  hasSkill: boolean,
  hasExperience: boolean,
): number {
  const fields: (string | null | undefined)[] = [
    profile.first_name,
    profile.last_name,
    profile.title,
    profile.summary,
    profile.phone,
    profile.location,
    profile.work_mode,
    profile.linkedin_url,
  ];
  let filled = fields.filter(
    (f) => typeof f === "string" && f.length > 0,
  ).length;
  if (hasSkill) filled++;
  if (hasExperience) filled++;
  return Math.round((filled / 10) * 100);
}

export default function CandidateDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [profileCompletion, setProfileCompletion] = useState<number | null>(
    null,
  );
  const [pendingInvitations, setPendingInvitations] = useState<number | null>(
    null,
  );
  const [activeGrants, setActiveGrants] = useState<number | null>(null);
  const [generatedDocs, setGeneratedDocs] = useState<number | null>(null);
  const [recentEvents, setRecentEvents] = useState<InteractionEvent[]>([]);

  useEffect(() => {
    let mounted = true;

    const profilePromise = api
      .get<CandidateProfile>("/candidates/me/profile")
      .catch(() => null);

    const skillsPromise = api
      .get<Skill[]>("/candidates/me/skills")
      .catch(() => null);

    const experiencesPromise = api
      .get<Experience[]>("/candidates/me/experiences")
      .catch(() => null);

    const invitationsPromise = api
      .get<Invitation[]>("/invitations/me")
      .catch(() => null);

    const orgsPromise = api
      .get<OrganizationInteractionCard[]>("/candidates/me/organizations")
      .catch(() => null);

    const docsPromise = api
      .get<unknown[]>("/candidates/me/documents")
      .catch(() => null);

    Promise.all([
      profilePromise,
      skillsPromise,
      experiencesPromise,
      invitationsPromise,
      orgsPromise,
      docsPromise,
    ]).then(([prof, skills, experiences, invitations, orgs, docs]) => {
      if (!mounted) return;

      if (prof) {
        setProfile(prof);
        const hasSkill = Array.isArray(skills) && skills.length > 0;
        const hasExp = Array.isArray(experiences) && experiences.length > 0;
        setProfileCompletion(calcProfileCompletion(prof, hasSkill, hasExp));
      }

      if (invitations !== null) {
        setPendingInvitations(
          invitations.filter((inv) => inv.status === "pending").length,
        );
      }

      if (orgs !== null) {
        setActiveGrants(
          orgs.filter((o) => o.current_status === "active").length,
        );
        const allEvents: InteractionEvent[] = orgs
          .flatMap((o) => o.events)
          .sort(
            (a, b) =>
              new Date(b.occurred_at).getTime() -
              new Date(a.occurred_at).getTime(),
          )
          .slice(0, 3);
        setRecentEvents(allEvents);
      }

      if (docs !== null) {
        setGeneratedDocs(docs.length);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
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

  const firstName = profile?.first_name ?? "";
  const completionPct = profileCompletion ?? 0;
  const completionSubtitle =
    profileCompletion === null
      ? ""
      : completionPct === 100
        ? "Profil complet"
        : "Infos manquantes";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">
          Bonjour{firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Voici l&apos;état de votre espace candidat
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Profil complété"
          value={profileCompletion !== null ? `${completionPct}%` : "—"}
          subtitle={completionSubtitle}
          color="primary"
        />
        <StatCard
          label="Invitations en attente"
          value={pendingInvitations !== null ? pendingInvitations : "—"}
          subtitle="En attente de réponse"
          color="amber"
        />
        <StatCard
          label="Accès actifs"
          value={activeGrants !== null ? activeGrants : "—"}
          subtitle="Organisations autorisées"
          color="emerald"
        />
        <StatCard
          label="Dossiers générés"
          value={generatedDocs !== null ? generatedDocs : "—"}
          subtitle="Par les recruteurs"
          color="neutral"
        />
      </div>

      <section>
        <h2 className="mb-4 text-base font-semibold">Actions rapides</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <QuickActionCard
            icon={User}
            label="Compléter mon profil"
            description="Complétez votre profil pour plus de visibilité"
            href="/candidate/profile"
          />
          <QuickActionCard
            icon={Mail}
            label="Mes invitations"
            description={
              pendingInvitations
                ? `${pendingInvitations} en attente de réponse`
                : "Aucune invitation en attente"
            }
            href="/candidate/requests"
            badge={pendingInvitations ?? undefined}
          />
          <QuickActionCard
            icon={Shield}
            label="Gérer mes accès"
            description={
              activeGrants
                ? `${activeGrants} organisation${activeGrants > 1 ? "s" : ""} autorisée${activeGrants > 1 ? "s" : ""}`
                : "Aucun accès actif"
            }
            href="/candidate/access"
          />
        </div>
      </section>

      {recentEvents.length > 0 && (
        <section>
          <h2 className="mb-4 text-base font-semibold">Activité récente</h2>
          <ul className="space-y-2">
            {recentEvents.map((ev, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-base" aria-hidden>
                    {EVENT_ICONS[ev.type] ?? "📋"}
                  </span>
                  <span className="text-sm text-foreground">
                    {EVENT_LABELS[ev.type] ?? ev.type}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {relativeDate(ev.occurred_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
