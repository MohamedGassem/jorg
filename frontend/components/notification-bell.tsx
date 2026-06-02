"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import { EVENT_ICONS, EVENT_LABELS, relativeDate } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type {
  InteractionEvent,
  OrganizationInteractionCard,
} from "@/types/api";

interface NotificationItem {
  icon: string;
  label: string;
  date: string;
  href?: string;
}

interface Props {
  /** Portal determines what data to fetch. */
  portal: "candidate" | "recruiter";
  orgId?: string | null;
}

export function NotificationBell({ portal, orgId }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (portal === "candidate") {
      api
        .get<OrganizationInteractionCard[]>("/candidates/me/organizations")
        .then((orgs) => {
          const events: InteractionEvent[] = orgs
            .flatMap((o) => o.events)
            .sort(
              (a, b) =>
                new Date(b.occurred_at).getTime() -
                new Date(a.occurred_at).getTime(),
            )
            .slice(0, 5);
          setItems(
            events.map((ev) => ({
              icon: EVENT_ICONS[ev.type] ?? "📋",
              label: EVENT_LABELS[ev.type] ?? ev.type,
              date: relativeDate(ev.occurred_at),
              href: "/candidate/access",
            })),
          );
        })
        .catch(() => {});
    }
    // recruiter: no-op for now — future: fetch recent docs/candidates
  }, [portal, orgId]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
          open && "bg-muted/50 text-foreground",
        )}
      >
        <Bell className="size-4" />
        {items.length > 0 && (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-72 rounded-lg border border-border bg-popover shadow-lg">
          <p className="border-b border-border/50 px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Activité récente
          </p>
          {items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Aucune activité récente.
            </p>
          ) : (
            <ul>
              {items.map((item, i) => (
                <li key={i}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/50"
                    >
                      <span className="text-base" aria-hidden>
                        {item.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{item.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.date}
                        </p>
                      </div>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <span className="text-base" aria-hidden>
                        {item.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{item.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.date}
                        </p>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
