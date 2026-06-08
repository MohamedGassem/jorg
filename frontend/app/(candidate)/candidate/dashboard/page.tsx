"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NotificationBell } from "@/components/notification-bell";
import { buttonVariants } from "@/components/ui/button";
import { StatCard } from "@/components/ui/StatCard";
import { api } from "@/lib/api";
import { eventLabel, relativeDate } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type {
  CandidateProfile,
  Experience,
  InteractionEvent,
  Invitation,
  OrganizationInteractionCard,
  Skill,
} from "@/types/api";

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
    (f) => typeof f === "string" && f.trim().length > 0,
  ).length;
  if (hasSkill) filled++;
  if (hasExperience) filled++;
  return Math.round((filled / 10) * 100);
}

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

function isFilled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
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

function ActivityList({ events }: { events: InteractionEvent[] }) {
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
            <p className="text-sm font-medium">{eventLabel(event)}</p>
            <p className="text-xs text-muted-foreground">
              {relativeDate(event.occurred_at)}
            </p>
          </div>
          <span className="mt-1 size-2 shrink-0 rounded-full bg-primary/70" />
        </li>
      ))}
    </ul>
  );
}

export default function CandidateDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [profileCompletion, setProfileCompletion] = useState<number | null>(
    null,
  );
  const [hasSkill, setHasSkill] = useState(false);
  const [hasExperience, setHasExperience] = useState(false);
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
        setProfileCompletion(
          calcProfileCompletion(prof, skillPresent, experiencePresent),
        );
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
  const completionPct = profileCompletion ?? 0;
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
      : completionPct < 100
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
      status: completionPct >= 100 ? "À jour" : "À compléter",
      tone: completionPct >= 100 ? "neutral" : "primary",
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
          value={`${completionPct}%`}
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
          label="Accès actifs"
          value={activeGrants !== null ? activeCount : "-"}
          subtitle="organisations autorisées"
          color="neutral"
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
                  {checklistPct}%
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
            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
              aria-label={`Progression du profil ${checklistPct}%`}
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${checklistPct}%` }}
              />
            </div>
            <ul className="mt-4 space-y-2">
              {checklist.map((item) => (
                <ChecklistRow key={item.label} item={item} />
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-border bg-surface p-5 2xl:p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Repères
            </p>
            <h2 className="mt-2 font-heading text-lg font-semibold">
              À vérifier cette semaine
            </h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="font-medium">Accès</p>
                <p className="mt-1 text-muted-foreground">
                  {pendingCount > 0
                    ? "Traitez les invitations avant de partager davantage votre profil."
                    : "Aucune invitation en attente. Vérifiez les accès actifs si besoin."}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="font-medium">Dossier généré</p>
                <p className="mt-1 text-muted-foreground">
                  {docsCount > 0
                    ? "Consultez l’activité pour suivre les derniers documents produits."
                    : "Générez un dossier lorsque votre profil est suffisamment complet."}
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
