"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CandidateGenerateDossierDialog } from "@/components/candidate-generate-dossier-dialog";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api";
import { relativeDate } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type {
  CandidateProfile,
  Experience,
  InteractionEvent,
  Invitation,
  OrganizationInteractionCard,
  Skill,
} from "@/types/api";

type DashboardAction = {
  title: string;
  description: string;
  cta: string;
  href?: string;
  onClick?: () => void;
};

type ChecklistItem = {
  label: string;
  detail: string;
  done: boolean;
};

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

function activityTitle(group: ActivityGroup): string {
  const labels: Record<InteractionEvent["type"], string> = {
    invitation_sent: "Invitation envoyée",
    invitation_accepted: "Invitation acceptée",
    invitation_rejected: "Invitation refusée",
    invitation_expired: "Invitation expirée",
    access_granted: "Accès accordé",
    access_revoked: "Accès révoqué",
    document_generated: "Dossier généré",
  };
  const count = group.count > 1 ? ` (${group.count})` : "";
  return `${labels[group.type]}${count} - ${group.organizationName}`;
}

function recruiterName(event: InteractionEvent): string | null {
  const parts = [
    event.metadata.recruiter_first_name,
    event.metadata.recruiter_last_name,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

function eventDetail(event: ActivityEvent): string {
  const recruiter = recruiterName(event);
  if (event.type === "document_generated") {
    const details = [
      event.metadata.template_name
        ? `Modèle : ${event.metadata.template_name}`
        : null,
      recruiter ? `Recruteur : ${recruiter}` : null,
      event.metadata.file_format
        ? `Format : ${event.metadata.file_format.toUpperCase()}`
        : null,
    ].filter(Boolean);
    return details.length > 0
      ? details.join(" · ")
      : "Document produit depuis votre profil.";
  }
  return recruiter
    ? `Recruteur : ${recruiter}`
    : "Organisation liée à votre dossier.";
}

function ActionCta({
  action,
  variant = "outline",
  className,
}: {
  action: DashboardAction;
  variant?: "default" | "outline";
  className?: string;
}) {
  const classes = cn(
    buttonVariants({
      variant,
      size: variant === "default" ? "default" : "sm",
    }),
    className,
  );

  if (action.onClick) {
    return (
      <button type="button" onClick={action.onClick} className={classes}>
        {action.cta}
      </button>
    );
  }

  if (action.href) {
    return (
      <Link href={action.href} className={classes}>
        {action.cta}
      </Link>
    );
  }

  return null;
}

function ActionCard({ action }: { action: DashboardAction }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <h3 className="font-heading text-base font-semibold">{action.title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {action.description}
      </p>
      <ActionCta action={action} className="mt-4" />
    </article>
  );
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border/70 bg-background px-3 py-2.5">
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[0.6rem] font-bold",
          item.done
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-muted text-muted-foreground",
        )}
        aria-hidden="true"
      />
      <span>
        <span className="block text-sm font-medium">{item.label}</span>
        <span className="block text-xs leading-5 text-muted-foreground">
          {item.detail}
        </span>
      </span>
    </li>
  );
}

function ProfileProgressBar({ value }: { value: number }) {
  const progressColor =
    value < 40 ? "bg-danger" : value < 75 ? "bg-warning" : "bg-success";

  return (
    <div
      className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
      aria-label={`Progression du profil ${value}%`}
    >
      <div
        className={cn("h-full rounded-full transition-all", progressColor)}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function ActivityList({ groups }: { groups: ActivityGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
        <p className="text-sm font-medium">Aucune activité récente</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Les invitations, accès et dossiers générés apparaîtront ici.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {groups.slice(0, 5).map((group) => (
        <li
          key={group.key}
          className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-2.5"
        >
          <div>
            <p className="text-sm font-medium">{activityTitle(group)}</p>
            <p className="text-xs text-muted-foreground">
              {eventDetail(group.latestEvent)}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {relativeDate(group.latestAt)}
          </span>
        </li>
      ))}
    </ul>
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

      const skillPresent = Array.isArray(skills) && skills.length > 0;
      const experiencePresent =
        Array.isArray(experiences) && experiences.length > 0;
      setHasSkill(skillPresent);
      setHasExperience(experiencePresent);

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
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="h-8 w-64 rounded-lg bg-muted" />
            <div className="h-4 w-96 rounded-lg bg-muted" />
          </div>
          <div className="h-9 w-9 rounded-lg bg-muted" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-lg bg-muted" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(720px,1fr)_360px] 2xl:grid-cols-[minmax(900px,1fr)_380px]">
          <div className="h-[520px] rounded-lg bg-muted" />
          <div className="h-[520px] rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  const firstName = profile?.first_name ?? "";
  const checklist: ChecklistItem[] = [
    {
      label: "Identité professionnelle",
      detail: "Nom, titre et positionnement visibles.",
      done:
        isFilled(profile?.first_name) &&
        isFilled(profile?.last_name) &&
        isFilled(profile?.title),
    },
    {
      label: "Résumé candidat",
      detail: "Une synthèse courte pour cadrer votre profil.",
      done: isFilled(profile?.summary),
    },
    {
      label: "Expériences",
      detail: "Au moins une expérience structurée.",
      done: hasExperience,
    },
    {
      label: "Compétences",
      detail: "Des compétences exploitables par les recruteurs.",
      done: hasSkill,
    },
    {
      label: "Coordonnées et préférences",
      detail: "Téléphone, localisation et mode de travail.",
      done:
        isFilled(profile?.phone) &&
        isFilled(profile?.location) &&
        isFilled(profile?.work_mode),
    },
  ];
  const completedChecklist = checklist.filter((item) => item.done).length;
  const checklistPct = Math.round(
    (completedChecklist / checklist.length) * 100,
  );
  const profileProgressPct = checklistPct;
  const pendingCount = pendingInvitations?.length ?? 0;
  const activeOrganizations = (organizations ?? []).filter(
    (org) => org.current_status === "active",
  );
  const activeCount = activeOrganizations.length;
  const activityGroups = compactActivity(recentEvents);
  const pendingOrgNames = (pendingInvitations ?? [])
    .map((inv) => inv.organization_name)
    .filter(Boolean);

  const primaryAction: DashboardAction =
    pendingCount > 0
      ? {
          title: `${pendingCount} invitation${pendingCount > 1 ? "s" : ""} en attente`,
          description:
            pendingOrgNames.length > 0
              ? `Décidez si ${pendingOrgNames.slice(0, 2).join(", ")} peut accéder à vos données structurées candidat.`
              : "Décidez quelles organisations peuvent accéder à vos données structurées candidat.",
          href: "/candidate/access",
          cta: "Voir les invitations",
        }
      : profileProgressPct < 100
        ? {
            title: "Compléter votre profil structuré",
            description:
              "Ajoutez ou vérifiez vos expériences, compétences et informations clés. Ces données serviront à générer vos dossiers candidat.",
            href: "/candidate/profile",
            cta: "Continuer mon profil",
          }
        : activeCount > 0
          ? {
              title: "Gardez le contrôle sur vos accès",
              description: `${activeCount} organisation${activeCount > 1 ? "s" : ""} ${activeCount > 1 ? "peuvent" : "peut"} consulter votre profil et générer des documents. Vous pouvez révoquer un accès à tout moment.`,
              href: "/candidate/access",
              cta: "Gérer les accès",
            }
          : {
              title: "Prévisualisez votre dossier",
              description:
                "Votre profil est complet. Vérifiez comment vos informations peuvent être présentées dans un dossier généré.",
              cta: "Prévisualiser mon dossier",
              onClick: () => setModelDialogOpen(true),
            };

  const secondaryActions: DashboardAction[] = [
    {
      title: "Mettre à jour le profil",
      description:
        "Gardez vos données structurées candidat alignées avec votre situation actuelle.",
      href: "/candidate/profile",
      cta: "Ouvrir mon profil",
    },
    {
      title: "Vérifier qui a accès",
      description:
        "Consultez les accès actifs, les invitations reçues et l’historique associé.",
      href: "/candidate/access",
      cta: "Voir les accès",
    },
    {
      title: "Prévisualiser un dossier",
      description:
        "Ouvrez les modèles disponibles pour voir comment vos informations peuvent être présentées.",
      cta: "Prévisualiser",
      onClick: () => setModelDialogOpen(true),
    },
  ];

  return (
    <div className="w-full space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Accueil candidat
          </p>
          <h1 className="mt-2 text-2xl font-bold">
            {firstName
              ? `Bonjour ${firstName}, votre espace Jorg`
              : "Votre espace Jorg"}
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Retrouvez quoi faire maintenant, qui a accès à votre profil et les
            derniers événements liés à votre dossier.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <NotificationBell portal="candidate" />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(720px,1fr)_360px] 2xl:grid-cols-[minmax(900px,1fr)_380px]">
        <main className="min-w-0 space-y-5">
          <section className="rounded-lg border border-accent-amber-border bg-accent-amber-soft p-5 2xl:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-warning">
                  À faire maintenant
                </p>
                <h2 className="mt-2 font-heading text-xl font-semibold">
                  {primaryAction.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {primaryAction.description}
                </p>
              </div>
              <ActionCta
                action={primaryAction}
                variant="default"
                className="w-fit"
              />
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3 2xl:gap-4">
              {secondaryActions.map((action) => (
                <ActionCard key={action.title} action={action} />
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-5 lg:grid-cols-[0.9fr_1.1fr] 2xl:grid-cols-[0.8fr_1.2fr]">
            <article className="rounded-lg border border-border bg-surface p-5 2xl:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Accès candidat
                  </p>
                  <h2 className="mt-2 font-heading text-lg font-semibold">
                    Qui peut accéder à votre profil ?
                  </h2>
                </div>
              </div>
              <div className="mt-5 space-y-2">
                {activeOrganizations.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
                    <p className="text-sm font-medium">
                      Aucune organisation autorisée
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Un accès est une autorisation donnée à une organisation
                      pour consulter votre profil et générer un dossier.
                    </p>
                  </div>
                ) : (
                  activeOrganizations.slice(0, 4).map((org) => (
                    <div
                      key={org.organization_id}
                      className="rounded-lg border border-border bg-background p-3"
                    >
                      <p className="text-sm font-medium">
                        {org.organization_name}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Peut consulter vos données structurées candidat et
                        générer un document de dossier.
                      </p>
                    </div>
                  ))
                )}
                {activeOrganizations.length > 4 && (
                  <p className="text-xs text-muted-foreground">
                    +{activeOrganizations.length - 4} organisation
                    {activeOrganizations.length - 4 > 1 ? "s" : ""} à consulter
                    dans l’historique.
                  </p>
                )}
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Vous pouvez révoquer un accès à tout moment depuis la page
                dédiée.
              </p>
              <Link
                href="/candidate/access"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "mt-4",
                )}
              >
                Gérer les accès
              </Link>
            </article>

            <article className="rounded-lg border border-border bg-surface p-5 2xl:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Activité récente
                  </p>
                  <h2 className="mt-2 font-heading text-lg font-semibold">
                    Ce qui s’est passé
                  </h2>
                </div>
              </div>
              <div className="mt-4">
                <ActivityList groups={activityGroups} />
              </div>
              <Link
                href="/candidate/access"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "mt-4",
                )}
              >
                Voir tout l’historique
              </Link>
            </article>
          </section>
        </main>

        <aside className="min-w-0 space-y-5 xl:sticky xl:top-8 xl:self-start">
          <section className="rounded-lg border border-border bg-surface p-5 2xl:p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Progression
            </p>
            <h2 className="mt-2 font-heading text-lg font-semibold">
              Compléter le profil
            </h2>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-3xl font-semibold text-primary">
                  {profileProgressPct}%
                </p>
                <p className="text-sm text-muted-foreground">
                  {completedChecklist}/{checklist.length} étapes complètes
                </p>
              </div>
              <Link
                href="/candidate/profile"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Modifier
              </Link>
            </div>
            <ProfileProgressBar value={profileProgressPct} />
            <ul className="mt-4 space-y-2">
              {checklist.map((item) => (
                <ChecklistRow key={item.label} item={item} />
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Ressource
            </p>
            <h2 className="mt-2 font-heading text-base font-semibold">
              Modèles de dossier
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Quand l’essentiel est traité, comparez les formats de documents
              générés depuis votre profil.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <span className="rounded-lg border border-border bg-background px-2 py-2">
                Compact
              </span>
              <span className="rounded-lg border border-border bg-background px-2 py-2">
                Technique
              </span>
              <span className="rounded-lg border border-border bg-background px-2 py-2">
                Complet
              </span>
            </div>
            <button
              type="button"
              onClick={() => setModelDialogOpen(true)}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "mt-4 w-full",
              )}
            >
              Parcourir les modèles
            </button>
          </section>
        </aside>
      </div>

      <CandidateGenerateDossierDialog
        open={modelDialogOpen}
        onOpenChange={setModelDialogOpen}
      />
    </div>
  );
}
