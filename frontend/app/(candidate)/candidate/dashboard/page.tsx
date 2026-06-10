"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, FolderOpen, Key, Mail, Plus, Shield, User } from "lucide-react";
import { CandidateGenerateDossierDialog } from "@/components/candidate-generate-dossier-dialog";
import { buttonVariants } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/StatusPill";
import { api } from "@/lib/api";
import { ORG_STATUS_PILLS, relativeDate } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type {
  CandidateProfile,
  Experience,
  InteractionEvent,
  Invitation,
  OrganizationInteractionCard,
  Skill,
} from "@/types/api";

type ActivityEvent = InteractionEvent & {
  organizationId: string;
  organizationName: string;
};

type ActivityGroup = {
  key: string;
  type: InteractionEvent["type"];
  organizationName: string;
  latestAt: string;
  count: number;
  latestEvent: ActivityEvent;
};

function isFilled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function compactActivity(events: ActivityEvent[]): ActivityGroup[] {
  const groups = new Map<string, ActivityGroup>();
  for (const event of events) {
    const key = [
      event.type,
      event.organizationId,
      event.metadata.template_name ?? "",
    ].join(":");
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        type: event.type,
        organizationName: event.organizationName,
        latestAt: event.occurred_at,
        count: 1,
        latestEvent: event,
      });
      continue;
    }
    existing.count += 1;
    if (new Date(event.occurred_at) > new Date(existing.latestAt)) {
      existing.latestAt = event.occurred_at;
      existing.latestEvent = event;
    }
  }
  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime(),
  );
}

const ACTIVITY_LABELS: Record<InteractionEvent["type"], string> = {
  invitation_sent: "Invitation envoyée",
  invitation_accepted: "Invitation acceptée",
  invitation_rejected: "Invitation refusée",
  invitation_expired: "Invitation expirée",
  access_granted: "Accès accordé",
  access_revoked: "Accès révoqué",
  document_generated: "Dossier généré",
};

const ACTIVITY_ICONS: Record<
  InteractionEvent["type"],
  React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  invitation_sent: Mail,
  invitation_accepted: Mail,
  invitation_rejected: Mail,
  invitation_expired: Mail,
  access_granted: Shield,
  access_revoked: Key,
  document_generated: FolderOpen,
};

const ACTIVITY_ACCENT: InteractionEvent["type"][] = [
  "access_granted",
  "document_generated",
];

function orgInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function grantedDate(org: OrganizationInteractionCard): string | null {
  const granted = org.events
    .filter((event) => event.type === "access_granted")
    .sort(
      (a, b) =>
        new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
    )[0];
  return granted
    ? new Date(granted.occurred_at).toLocaleDateString("fr-FR")
    : null;
}

function StatCell({
  icon: Icon,
  label,
  value,
  foot,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
  foot: string;
}) {
  return (
    <div className="flex flex-col gap-2 bg-surface px-5 py-[18px]">
      <div className="flex items-center justify-between">
        <span className="j-overline tracking-[0.1em]">{label}</span>
        <span className="grid size-[30px] place-items-center rounded-[7px] border border-line bg-paper-2 text-ink-3">
          <Icon className="size-[15px]" strokeWidth={1.6} />
        </span>
      </div>
      <div className="font-mono text-[28px] font-medium leading-none tracking-tight tabular-nums">
        {value}
      </div>
      <div className="text-[12.5px] text-ink-3">{foot}</div>
    </div>
  );
}

export default function CandidateDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [hasSkill, setHasSkill] = useState(false);
  const [hasExperience, setHasExperience] = useState(false);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<
    Invitation[] | null
  >(null);
  const [organizations, setOrganizations] = useState<
    OrganizationInteractionCard[] | null
  >(null);
  const [recentEvents, setRecentEvents] = useState<ActivityEvent[]>([]);

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

    Promise.all([
      profilePromise,
      skillsPromise,
      experiencesPromise,
      invitationsPromise,
      orgsPromise,
    ]).then(([prof, skills, experiences, invitations, orgs]) => {
      if (!mounted) return;

      if (prof && !prof.onboarding_completed) {
        router.replace("/onboarding/candidate/profile");
        return;
      }

      setHasSkill(Array.isArray(skills) && skills.length > 0);
      setHasExperience(Array.isArray(experiences) && experiences.length > 0);

      if (prof) {
        setProfile(prof);
      }

      if (invitations !== null) {
        setPendingInvitations(
          invitations.filter((inv) => inv.status === "pending"),
        );
      }

      if (orgs !== null) {
        setOrganizations(orgs);
        const allEvents: ActivityEvent[] = orgs
          .flatMap((o) =>
            o.events.map((event) => ({
              ...event,
              organizationId: o.organization_id,
              organizationName: o.organization_name,
            })),
          )
          .sort(
            (a, b) =>
              new Date(b.occurred_at).getTime() -
              new Date(a.occurred_at).getTime(),
          )
          .slice(0, 6);
        setRecentEvents(allEvents);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [router]);

  if (loading) {
    return (
      <div className="w-full space-y-5 animate-pulse">
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

  const firstName = profile?.first_name ?? "";
  const checklistDone = [
    isFilled(profile?.first_name) &&
      isFilled(profile?.last_name) &&
      isFilled(profile?.title),
    isFilled(profile?.summary),
    hasExperience,
    hasSkill,
    isFilled(profile?.phone) &&
      isFilled(profile?.location) &&
      isFilled(profile?.work_mode),
  ];
  const completedCount = checklistDone.filter(Boolean).length;
  const completionPct = Math.round(
    (completedCount / checklistDone.length) * 100,
  );
  const pendingCount = pendingInvitations?.length ?? 0;
  const orgs = organizations ?? [];
  const activeCount = orgs.filter((o) => o.current_status === "active").length;
  const docsGenerated = orgs
    .flatMap((o) => o.events)
    .filter((e) => e.type === "document_generated").length;
  const activityGroups = compactActivity(recentEvents);

  const lead =
    pendingCount > 0
      ? `${pendingCount} invitation${pendingCount > 1 ? "s" : ""} en attente de votre décision.`
      : activeCount > 0
        ? `Votre dossier est partagé avec ${activeCount} organisation${activeCount > 1 ? "s" : ""} et reste sous votre contrôle.`
        : "Votre dossier n'est partagé avec aucune organisation pour le moment.";

  const primaryCta =
    pendingCount > 0
      ? { href: "/candidate/access", label: "Voir les invitations" }
      : completionPct < 100
        ? { href: "/candidate/profile", label: "Compléter mon dossier" }
        : { href: "/candidate/access", label: "Gérer les accès" };

  return (
    <div className="flex w-full flex-col gap-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="j-overline">
            Dossier candidat
            {profile?.updated_at
              ? ` · mis à jour ${relativeDate(profile.updated_at)}`
              : ""}
          </p>
          <h1 className="mt-2 font-heading text-[27px] font-semibold leading-tight">
            {firstName ? `Bonjour ${firstName}` : "Votre espace Jorg"}
          </h1>
          <p className="mt-1 text-[15px] text-ink-2">{lead}</p>
        </div>
        <Link
          href={primaryCta.href}
          className={cn(buttonVariants({ variant: "default" }), "w-fit")}
        >
          {primaryCta.label}
        </Link>
      </header>

      <section
        className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Statistiques du dossier"
      >
        <StatCell
          icon={User}
          label="Complétude"
          value={`${completionPct}%`}
          foot={`${completedCount} / ${checklistDone.length} sections`}
        />
        <StatCell
          icon={Shield}
          label="Accès actifs"
          value={String(activeCount)}
          foot={
            activeCount > 0
              ? `organisation${activeCount > 1 ? "s" : ""} autorisée${activeCount > 1 ? "s" : ""}`
              : "aucune organisation"
          }
        />
        <StatCell
          icon={FolderOpen}
          label="Dossiers générés"
          value={String(docsGenerated)}
          foot="depuis vos données"
        />
        <StatCell
          icon={Mail}
          label="Invitations"
          value={String(pendingCount)}
          foot={pendingCount > 0 ? "en attente de décision" : "rien à traiter"}
        />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.7fr_1fr]">
        {/* Registre des accès */}
        <article className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
          <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-[18px]">
            <h2 className="font-heading text-[17px] font-semibold">
              Registre des accès
            </h2>
            {activeCount > 0 && (
              <StatusPill tone="positive">
                {activeCount} actif{activeCount > 1 ? "s" : ""}
              </StatusPill>
            )}
          </div>
          {orgs.length === 0 ? (
            <div className="mx-5 mb-5 rounded-md border border-dashed border-line-strong bg-paper-2 p-4">
              <p className="text-sm font-medium">
                Aucune organisation autorisée
              </p>
              <p className="mt-1 text-[12.5px] leading-5 text-ink-3">
                Un accès est une autorisation donnée à une organisation pour
                consulter votre profil et générer un dossier. Les accès
                apparaîtront ici, y compris révoqués — on n&apos;efface jamais
                une trace.
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Organisation", "Accordé le", "Statut", ""].map(
                    (label, i) => (
                      <th
                        key={i}
                        className="border-b border-line px-4 pb-3 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-4"
                      >
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {orgs.map((org) => {
                  const pill =
                    ORG_STATUS_PILLS[org.current_status] ??
                    ORG_STATUS_PILLS.invited;
                  const inactive =
                    org.current_status === "revoked" ||
                    org.current_status === "expired";
                  const granted = grantedDate(org);
                  return (
                    <tr
                      key={org.organization_id}
                      onClick={() => router.push("/candidate/access")}
                      className={cn(
                        "cursor-pointer border-b border-line last:border-b-0 hover:bg-paper-2",
                        inactive && "opacity-55",
                      )}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-[11px]">
                          <span className="grid size-[30px] place-items-center rounded-[7px] border border-line bg-paper-2 font-heading text-[13px] font-semibold text-ink-2">
                            {orgInitials(org.organization_name)}
                          </span>
                          <span className="whitespace-nowrap text-sm font-medium">
                            {org.organization_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="j-meta text-[12.5px]">
                          {granted ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-[13.5px] font-medium text-ink-3">
                          Détails
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
                Générer un dossier sur mesure
              </h2>
            </div>
            <p className="mb-4 text-[13.5px] leading-relaxed text-ink-2">
              Sélectionnez un modèle : Jorg compose un dossier ciblé à partir de
              vos données vérifiées.
            </p>
            <button
              type="button"
              onClick={() => setModelDialogOpen(true)}
              className={cn(
                buttonVariants({ variant: "default" }),
                "w-full justify-center",
              )}
            >
              <Plus className="size-4" strokeWidth={1.6} />
              Prévisualiser un dossier
            </button>
          </article>

          <article className="flex-1 rounded-lg border border-line bg-surface px-[22px] py-5">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <h2 className="font-heading text-[17px] font-semibold">
                Journal
              </h2>
              <Link
                href="/candidate/access"
                className="text-[13.5px] font-medium text-ink-3 hover:text-primary"
              >
                Tout voir
              </Link>
            </div>
            {activityGroups.length === 0 ? (
              <p className="py-3 text-sm text-ink-3">
                Les invitations, accès et dossiers générés apparaîtront ici.
              </p>
            ) : (
              <div className="flex flex-col">
                {activityGroups.slice(0, 4).map((group, i, list) => {
                  const Icon = ACTIVITY_ICONS[group.type] ?? Eye;
                  const accent = ACTIVITY_ACCENT.includes(group.type);
                  return (
                    <Link
                      key={group.key}
                      href="/candidate/access"
                      className="group relative flex gap-3.5 py-3.5"
                    >
                      {i < list.length - 1 && (
                        <span
                          className="absolute bottom-[-2px] left-3.5 top-8 w-px bg-line"
                          aria-hidden
                        />
                      )}
                      <span
                        className={cn(
                          "z-10 grid size-[29px] shrink-0 place-items-center rounded-lg border",
                          accent
                            ? "border-accent-line bg-accent-soft text-primary"
                            : "border-line bg-paper-2 text-ink-3",
                        )}
                      >
                        <Icon className="size-3.5" strokeWidth={1.6} />
                      </span>
                      <span className="min-w-0 pt-0.5">
                        <span className="block text-sm group-hover:text-primary">
                          <b className="font-semibold">
                            {group.organizationName}
                          </b>{" "}
                          · {ACTIVITY_LABELS[group.type]}
                          {group.count > 1 ? ` (${group.count})` : ""}
                        </span>
                        <span className="mt-0.5 block font-mono text-[11.5px] text-ink-4">
                          {relativeDate(group.latestAt)}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </article>
        </div>
      </section>

      <CandidateGenerateDossierDialog
        open={modelDialogOpen}
        onOpenChange={setModelDialogOpen}
      />
    </div>
  );
}
