// frontend/lib/labels.ts
// Single source of truth for status labels/pills, event strings, and the
// small formatting helpers (initials, dates) shared across pages.

import { FolderOpen, Key, Mail, Shield, type LucideIcon } from "lucide-react";
import type { InteractionEvent } from "@/types/api";

/** Tone families of the handoff status taxonomy (one colour = one meaning). */
export type StatusTone = "positive" | "warn" | "accent" | "muted";

export const AVAILABILITY_LABELS: Record<string, string> = {
  available_now: "Immédiatement",
  available_from: "Disponible prochainement",
  not_available: "Non disponible",
};

export const WORK_MODE_LABELS: Record<string, string> = {
  remote: "Télétravail",
  onsite: "Présentiel",
  hybrid: "Hybride",
};

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  freelance: "Freelance",
  cdi: "CDI",
  both: "Freelance ou CDI",
};

export const DOMAIN_LABELS: Record<string, string> = {
  finance: "Finance",
  retail: "Distribution",
  industry: "Industrie",
  public: "Secteur public",
  health: "Santé",
  tech: "Tech",
  telecom: "Telecom",
  energy: "Énergie",
  other: "Autre",
};

export function labelFor(
  labels: Record<string, string>,
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return labels[value] ?? value;
}

/* Pills "registre" du design handoff (taxonomie 4 familles, libellés courts). */
export const ORG_STATUS_PILLS: Record<
  string,
  { label: string; tone: StatusTone }
> = {
  active: { label: "actif", tone: "positive" },
  invited: { label: "invitation en attente", tone: "muted" },
  revoked: { label: "révoqué", tone: "muted" },
  expired: { label: "expiré", tone: "muted" },
};

export const INVITATION_PILLS: Record<
  string,
  { label: string; tone: StatusTone }
> = {
  pending: { label: "en attente", tone: "warn" },
  accepted: { label: "acceptée", tone: "positive" },
  rejected: { label: "refusée", tone: "muted" },
  expired: { label: "expirée", tone: "muted" },
};

export const EVENT_LABELS: Record<string, string> = {
  invitation_sent: "Invitation envoyée",
  invitation_accepted: "Invitation acceptée",
  invitation_rejected: "Invitation refusée",
  invitation_expired: "Invitation expirée",
  access_granted: "Accès accordé",
  access_revoked: "Accès révoqué",
  document_generated: "Dossier généré",
};

/* Emoji set used by the lightweight notification dropdown. */
export const EVENT_ICONS: Record<string, string> = {
  invitation_sent: "✉️",
  invitation_accepted: "✅",
  invitation_rejected: "❌",
  invitation_expired: "⏰",
  access_granted: "🔓",
  access_revoked: "🔒",
  document_generated: "📄",
};

/* Lucide icons for the registre-style journals. */
export const EVENT_ICON_COMPONENTS: Record<
  InteractionEvent["type"],
  LucideIcon
> = {
  invitation_sent: Mail,
  invitation_accepted: Mail,
  invitation_rejected: Mail,
  invitation_expired: Mail,
  access_granted: Shield,
  access_revoked: Key,
  document_generated: FolderOpen,
};

/** Initials from a free-form display name (max 2 uppercase letters). */
export function initialsFromName(name: string, fallback = "?"): string {
  const letters = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return letters || fallback;
}

/** Initials from first/last name parts, with an optional extra fallback. */
export function initialsFromParts(
  first: string | null | undefined,
  last: string | null | undefined,
  extraFallback?: string,
): string {
  const letters = [first?.[0], last?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase();
  return letters || extraFallback?.[0]?.toUpperCase() || "?";
}

/** Short French date (dd/mm/yyyy). */
export function frDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR");
}

export function relativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "il y a 1j";
  return `il y a ${days}j`;
}
