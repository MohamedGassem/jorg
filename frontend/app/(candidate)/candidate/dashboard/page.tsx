"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CandidateGenerateDossierDialog } from "@/components/candidate-generate-dossier-dialog";
import { NotificationBell } from "@/components/notification-bell";
import { buttonVariants } from "@/components/ui/button";
import { StatCard } from "@/components/ui/StatCard";
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
  href: string;
  cta: string;
  status: string;
  tone: "primary" | "warning" | "neutral";
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

function isFilled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function eventTitle(event: ActivityEvent): string {
  const labels: Record<InteractionEvent["type"], string> = {
    invitation_sent: "Invitation envoyée",
    invitation_accepted: "Invitation acceptée",
    invitation_rejected: "Invitation refusée",
    invitation_expired: "Invitation expirée",
    access_granted: "Accès accordé",
    access_revoked: "Accès révoqué",
    document_generated: "Dossier généré",
  };
  return `${labels[event.type]} - ${event.organizationName}`;
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

function toneClasses(tone: DashboardAction["tone"]): string {
  if (tone === "warning") {
    return "border-warning/45 bg-warning/10 text-warning";
  }
  if (tone === "primary") {
    return "border-primary/35 bg-primary/10 text-primary";
  }
  return "border-border bg-muted text-muted-foreground";
}

function ActionCard({ action }: { action: DashboardAction }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={cn(
              "inline-flex rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-widest",
              toneClasses(action.tone),
            )}
          >
            {action.status}
          </p>
          <h3 className="mt-3 font-heading text-base font-semibold">
            {action.title}
          </h3>
        </div>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {action.description}
      </p>
      <Link
        href={action.href}
        className={cn(
          buttonVariants({
            variant: "outline",
            size: "sm",
          }),
          "mt-4",
        )}
      >
        {action.cta}
      </Link>
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
  return (
    <div
      className="relative mt-4 h-2 overflow-hidden rounded-full bg-gradient-to-r from-danger via-warning to-success"
      aria-label={`Progression du profil ${value}%`}
    >
      <div
        className="absolute inset-y-0 right-0 bg-muted/85"
        style={{ left: `${value}%` }}
      />
      <div
        className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow-sm"
        style={{ left: `calc(${value}% - 6px)` }}
      />
    </div>
  );
}

function ActivityList({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
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
      {events.slice(0, 6).map((event, index) => (
        <li
          key={`${event.occurred_at}-${index}`}
          className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-2.5"
        >
          <div>
            <p className="text-sm font-medium">{eventTitle(event)}</p>
            <p className="text-xs text-muted-foreground">
              {eventDetail(event)}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {relativeDate(event.occurred_at)}
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
  const [pendingInvitations, setPendingInvitations] = useState<number | null>(
    null,
  );
  const [activeGrants, setActiveGrants] = useState<number | null>(null);
  const [generatedDocs, setGeneratedDocs] = useState<number | null>(null);
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
          invitations.filter((inv) => inv.status === "pending").length,
        );
      }

      if (orgs !== null) {
        setActiveGrants(
          orgs.filter((o) => o.current_status === "active").length,
        );
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

      if (docs !== null) {
        setGeneratedDocs(docs.length);
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
  const pendingCount = pendingInvitations ?? 0;
  const activeCount = activeGrants ?? 0;
  const docsCount = generatedDocs ?? 0;
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

  const primaryAction: DashboardAction =
    pendingCount > 0
      ? {
          title: "Répondre aux invitations en attente",
          description:
            "Décidez quelles organisations peuvent consulter votre profil et générer un dossier.",
          href: "/candidate/access",
          cta: "Voir les invitations",
          status: "Action requise",
          tone: "warning",
        }
      : profileProgressPct < 100
        ? {
            title: "Compléter votre profil structuré",
            description:
              "Ajoutez les informations qui rendent votre dossier clair, contrôlé et exploitable.",
            href: "/candidate/profile",
            cta: "Continuer le profil",
            status: "Prochaine étape",
            tone: "primary",
          }
        : {
            title: "Contrôler les accès actifs",
            description:
              "Votre dossier est prêt. Vérifiez régulièrement qui peut y accéder et ce qui a été généré.",
            href: "/candidate/access",
            cta: "Gérer les accès",
            status: "À surveiller",
            tone: "neutral",
          };

  const secondaryActions: DashboardAction[] = [
    {
      title: "Mettre à jour le dossier",
      description:
        "Gardez votre profil, vos expériences et vos compétences alignés avec votre situation actuelle.",
      href: "/candidate/profile",
      cta: "Ouvrir mon dossier",
      status: profileProgressPct >= 100 ? "À jour" : "À compléter",
      tone: profileProgressPct >= 100 ? "neutral" : "primary",
    },
    {
      title: "Vérifier qui a accès",
      description:
        "Consultez les accès actifs, les invitations reçues et l’historique associé.",
      href: "/candidate/access",
      cta: "Voir les accès",
      status: pendingCount > 0 ? `${pendingCount} en attente` : "Contrôlé",
      tone: pendingCount > 0 ? "warning" : "neutral",
    },
    {
      title: "Préparer un dossier",
      description:
        "Générez une version partageable depuis votre profil lorsque le contenu est suffisamment complet.",
      href: "/candidate/profile",
      cta: "Préparer",
      status: `${docsCount} généré${docsCount === 1 ? "" : "s"}`,
      tone: "neutral",
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
        <NotificationBell portal="candidate" />
      </header>

      <section
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Indicateurs candidat"
      >
        <StatCard
          label="Profil structuré"
          value={`${profileProgressPct}%`}
          subtitle={`${completedChecklist}/${checklist.length} blocs essentiels`}
          color="primary"
        />
        <StatCard
          label="Invitations"
          value={pendingInvitations !== null ? pendingCount : "-"}
          subtitle={
            pendingCount > 0 ? "à traiter maintenant" : "aucune attente"
          }
          color={pendingCount > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Activité récente"
          value={recentEvents.length}
          subtitle="événements suivis"
          color={recentEvents.length > 0 ? "primary" : "neutral"}
        />
        <StatCard
          label="Dossiers"
          value={generatedDocs !== null ? docsCount : "-"}
          subtitle="documents générés"
          color="neutral"
        />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(720px,1fr)_360px] 2xl:grid-cols-[minmax(900px,1fr)_380px]">
        <main className="min-w-0 space-y-5">
          <section className="rounded-lg border border-border bg-surface p-5 2xl:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  À faire maintenant
                </p>
                <h2 className="mt-2 font-heading text-xl font-semibold">
                  {primaryAction.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {primaryAction.description}
                </p>
              </div>
              <Link
                href={primaryAction.href}
                className={cn(
                  buttonVariants({ variant: "default", size: "default" }),
                  "w-fit",
                )}
              >
                {primaryAction.cta}
              </Link>
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
                    Qui peut consulter votre dossier ?
                  </h2>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2 py-1 text-xs font-medium",
                    pendingCount > 0
                      ? "border-warning/45 bg-warning/10 text-warning"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {pendingCount > 0 ? "À valider" : "Sous contrôle"}
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-2xl font-semibold">{activeCount}</p>
                  <p className="text-xs text-muted-foreground">
                    accès actif{activeCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-2xl font-semibold text-warning">
                    {pendingCount}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    invitation{pendingCount === 1 ? "" : "s"} en attente
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Vous gardez la main sur les organisations autorisées et sur les
                dossiers générés à partir de votre profil.
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
                <span className="rounded-full border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                  {recentEvents.length} événement
                  {recentEvents.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-4">
                <ActivityList events={recentEvents} />
              </div>
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

          <section className="rounded-lg border border-border bg-surface p-5 2xl:p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Modèles de dossier
            </p>
            <h2 className="mt-2 font-heading text-lg font-semibold">
              Trouver le format qui vous correspond
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Parcourez les modèles de dossier de compétences Jorg, comparez
              leur niveau de détail et ouvrez celui qui raconte le mieux votre
              profil.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <span className="rounded-lg border border-border bg-background px-2 py-2">
                Compact
              </span>
              <span className="rounded-lg border border-border bg-background px-2 py-2">
                Technique
              </span>
              <span className="rounded-lg border border-border bg-background px-2 py-2">
                Premium
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
