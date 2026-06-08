"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LayoutDashboard, LogOut, User } from "lucide-react";
import { logout as authLogout } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface LandingUserMenuProps {
  dashboardHref: string;
  email: string;
}

export function LandingUserMenu({
  dashboardHref,
  email,
}: LandingUserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const initial = email.charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-border/60 bg-background py-1 pl-1 pr-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
      >
        <span
          className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
          aria-hidden
        >
          {initial || <User className="size-4" />}
        </span>
        <span className="hidden sm:inline">Accueil</span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-border/60 bg-popover p-1 shadow-lg"
        >
          <div className="border-b border-border/40 px-3 py-2">
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
          <Link
            href={dashboardHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
          >
            <LayoutDashboard className="size-4 text-muted-foreground" />
            Accueil
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void authLogout();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="size-4" />
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}
