// frontend/lib/labels.ts
// Single source of truth for all status labels, variants, and event strings.

import type { InteractionEvent } from "@/types/api";

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

export const INVITATION_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  rejected: "Refusée",
  expired: "Expirée",
};

export const INVITATION_STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "default",
  accepted: "secondary",
  rejected: "destructive",
  expired: "outline",
};

/* Pills "registre" du design handoff (taxonomie 4 familles, libellés courts) */
export const ORG_STATUS_PILLS: Record<
  string,
  { label: string; tone: "positive" | "warn" | "accent" | "muted" }
> = {
  active: { label: "actif", tone: "positive" },
  invited: { label: "invitation en attente", tone: "muted" },
  revoked: { label: "révoqué", tone: "muted" },
  expired: { label: "expiré", tone: "muted" },
};

export const ACCESS_STATUS_LABELS: Record<string, string> = {
  active: "Accès actif",
  invited: "Invitation en attente",
  revoked: "Accès révoqué",
  expired: "Invitation expirée",
};

export const ACCESS_STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "default",
  invited: "secondary",
  revoked: "destructive",
  expired: "outline",
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

export const EVENT_ICONS: Record<string, string> = {
  invitation_sent: "✉️",
  invitation_accepted: "✅",
  invitation_rejected: "❌",
  invitation_expired: "⏰",
  access_granted: "🔓",
  access_revoked: "🔒",
  document_generated: "📄",
};

export function eventLabel(ev: InteractionEvent): string {
  if (ev.type === "document_generated") {
    const parts = [
      ev.metadata.recruiter_first_name,
      ev.metadata.recruiter_last_name,
    ].filter(Boolean);
    const recruiterName = parts.join(" ");
    return recruiterName
      ? `Dossier généré par ${recruiterName}`
      : "Dossier généré";
  }
  return EVENT_LABELS[ev.type] ?? ev.type;
}

export function relativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "il y a 1j";
  return `il y a ${days}j`;
}
