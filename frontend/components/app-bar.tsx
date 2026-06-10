"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  LayoutGrid,
  LogOut,
  Settings,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/lib/api";
import { logout as authLogout } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { CandidateProfile } from "@/types/api";

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
      <div className="flex h-[58px] items-center gap-[18px] px-7">
        <Link href={homeHref} className="flex items-center gap-[11px]">
          <span
            className="grid size-[30px] place-items-center rounded-[7px] bg-ink font-heading text-[17px] font-semibold text-bg-app dark:bg-primary dark:text-accent-ink"
            aria-hidden
          >
            J
          </span>
          <span className="font-heading text-[19px] font-semibold tracking-tight">
            Jorg
          </span>
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
      <nav className="flex gap-1.5 px-7" aria-label="Navigation principale">
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
      .then((profile) => {
        const letters = [profile.first_name?.[0], profile.last_name?.[0]]
          .filter(Boolean)
          .join("")
          .toUpperCase();
        if (letters) setInitials(letters);
      })
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
