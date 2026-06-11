"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  FileText,
  FolderOpen,
  LayoutGrid,
  LogOut,
  Settings,
  Shield,
  Users,
  type LucideIcon,
} from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { JorgWordmark } from "@/components/ui/JorgWordmark";
import { api } from "@/lib/api";
import { logout as authLogout } from "@/lib/auth";
import { initialsFromName, initialsFromParts } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type {
  CandidateProfile,
  Organization,
  RecruiterProfile,
} from "@/types/api";

export interface AppBarTab {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface AppBarProps {
  tabs: AppBarTab[];
  portal: "candidate" | "recruiter";
  context: React.ReactNode;
  homeHref: string;
  initials: string | null;
  orgId?: string | null;
}

export function AppBar({
  tabs,
  portal,
  context,
  homeHref,
  initials,
  orgId,
}: AppBarProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="mx-auto flex h-[58px] w-full max-w-[var(--shell)] items-center gap-[18px] px-7">
        <Link href={homeHref}>
          <JorgWordmark />
        </Link>
        <span className="h-[26px] w-px bg-line" aria-hidden />
        <span className="j-meta text-[12.5px]">{context}</span>
        <span className="flex-1" />
        <ThemeToggle />
        <NotificationBell portal={portal} orgId={orgId} />
        <span className="ml-1.5 grid size-[34px] place-items-center rounded-lg border border-accent-line bg-accent-soft font-heading text-sm font-semibold text-primary">
          {initials ?? "·"}
        </span>
        <button
          type="button"
          onClick={() => void authLogout()}
          aria-label="Déconnexion"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <LogOut className="size-4" strokeWidth={1.6} />
        </button>
      </div>
      <nav
        className="mx-auto flex w-full max-w-[var(--shell)] gap-1.5 overflow-x-auto px-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Navigation principale"
      >
        {tabs.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-[2.5px] px-3.5 pb-3 pt-2.5 text-[13.5px] transition-colors",
                active
                  ? "border-primary bg-accent-soft-2 font-semibold text-ink"
                  : "border-transparent font-medium text-ink-3 hover:text-ink",
              )}
            >
              <tab.icon
                className={cn("size-4", active ? "text-primary" : "text-ink-4")}
                strokeWidth={1.6}
              />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

const CANDIDATE_TABS: AppBarTab[] = [
  { href: "/candidate/dashboard", label: "Tableau de bord", icon: LayoutGrid },
  { href: "/candidate/profile", label: "Mon dossier", icon: FileText },
  { href: "/candidate/access", label: "Accès & partages", icon: Shield },
  { href: "/candidate/settings", label: "Paramètres", icon: Settings },
];

export function CandidateAppBar() {
  const [initials, setInitials] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<CandidateProfile>("/candidates/me/profile")
      .then((profile) =>
        setInitials(initialsFromParts(profile.first_name, profile.last_name)),
      )
      .catch(() => {});
  }, []);

  return (
    <AppBar
      tabs={CANDIDATE_TABS}
      portal="candidate"
      context="Espace candidat"
      homeHref="/candidate/dashboard"
      initials={initials}
    />
  );
}

const RECRUITER_TABS: AppBarTab[] = [
  { href: "/recruiter/dashboard", label: "Tableau de bord", icon: LayoutGrid },
  { href: "/recruiter/candidates", label: "Candidats", icon: Users },
  {
    href: "/recruiter/opportunities",
    label: "Missions",
    icon: BriefcaseBusiness,
  },
  { href: "/recruiter/documents", label: "Dossiers générés", icon: FolderOpen },
  { href: "/recruiter/settings", label: "Paramètres", icon: Settings },
];

export function RecruiterAppBar() {
  const [initials, setInitials] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<RecruiterProfile>("/recruiters/me/profile"),
      api.get<{ email: string }>("/auth/me"),
    ])
      .then(([profile, me]) => {
        setInitials(
          initialsFromParts(profile.first_name, profile.last_name, me.email),
        );
        if (profile.organization_id) {
          setOrgId(profile.organization_id);
          api
            .get<Organization>(`/organizations/${profile.organization_id}`)
            .then(setOrg)
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const context = (
    <span className="flex items-center gap-2">
      Espace recruteur
      {org && (
        <span className="inline-flex h-6 items-center gap-1.5 rounded-[5px] border border-line-2 bg-paper-2 px-2 font-mono text-[11.5px] font-medium text-ink-2">
          <span className="grid size-[18px] place-items-center rounded border border-line bg-surface font-heading text-[9px] font-semibold">
            {initialsFromName(org.name)}
          </span>
          {org.name}
        </span>
      )}
    </span>
  );

  return (
    <AppBar
      tabs={RECRUITER_TABS}
      portal="recruiter"
      context={context}
      homeHref="/recruiter/dashboard"
      initials={initials}
      orgId={orgId}
    />
  );
}
