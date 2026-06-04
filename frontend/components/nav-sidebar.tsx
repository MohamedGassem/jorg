// frontend/components/nav-sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  User,
  Shield,
  FileText,
  Settings,
  Users,
  Zap,
  LayoutDashboard,
  LogOut,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { JorgWordmark } from "@/components/ui/JorgWordmark";
import { logout as authLogout } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
}

interface NavSidebarProps {
  items: NavItem[];
  title: string;
  homeHref?: string;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  "/candidate/dashboard": LayoutDashboard,
  "/candidate/profile": User,
  "/candidate/access": Shield,
  "/candidate/settings": Settings,
  "/recruiter/dashboard": LayoutDashboard,
  "/recruiter/candidates": Users,
  "/recruiter/opportunities": Zap,
  "/recruiter/documents": FileText,
  "/recruiter/settings": Settings,
};

export function NavSidebar({ items, title, homeHref }: NavSidebarProps) {
  const pathname = usePathname();

  function logout() {
    void authLogout();
  }

  const isCandidate = title.toLowerCase().includes("candidat");

  return (
    <nav
      className="flex h-full w-60 flex-col border-r border-border/50 bg-sidebar px-3 py-5"
      aria-label={`Navigation ${title}`}
    >
      {/* Wordmark */}
      <Link
        href={homeHref ?? "/"}
        className="mb-6 flex items-center gap-2.5 px-3 py-1"
      >
        <JorgWordmark />
      </Link>

      {/* Portal label */}
      <p className="mb-2 px-3 text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground/60">
        {isCandidate ? "Candidat" : "Recruteur"}
      </p>

      <ul className="flex flex-col gap-0.5" role="list">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = ICON_MAP[item.href];
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                {Icon && (
                  <Icon
                    className={cn(
                      "size-4 shrink-0 transition-colors",
                      active ? "text-primary" : "text-muted-foreground/70",
                    )}
                  />
                )}
                {item.label}
                {active && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto">
        <Separator className="mb-3 opacity-50" />
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="size-4 shrink-0" />
          Déconnexion
        </button>
      </div>
    </nav>
  );
}
