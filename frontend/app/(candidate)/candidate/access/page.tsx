// frontend/app/(candidate)/candidate/access/page.tsx
"use client";

import { useState } from "react";
import {
  Bell,
  Check,
  Download,
  Eye,
  FolderOpen,
  Key,
  Mail,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { StatusPill, type StatusTone } from "@/components/ui/StatusPill";
import { api, ApiError } from "@/lib/api";
import { ORG_STATUS_PILLS, relativeDate } from "@/lib/labels";
import { useAsyncData, useDownload } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type {
  GeneratedDocumentCandidateView,
  InteractionEvent,
  Invitation,
  OrganizationInteractionCard,
} from "@/types/api";

const PAST_INVITATION_PILLS: Record<
  string,
  { label: string; tone: StatusTone }
> = {
  accepted: { label: "acceptée", tone: "positive" },
  rejected: { label: "refusée", tone: "muted" },
  expired: { label: "expirée", tone: "muted" },
};

const JOURNAL_ICONS: Record<
  InteractionEvent["type"],
  React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  invitation_sent: Mail,
  invitation_accepted: Mail,
  invitation_rejected: Mail,
  invitation_expired: Mail,
  access_granted: Shield,
  access_revoked: Key,
  document_generated: FolderOpen,
};

const JOURNAL_LABELS: Record<InteractionEvent["type"], string> = {
  invitation_sent: "Invitation envoyée",
  invitation_accepted: "Invitation acceptée",
  invitation_rejected: "Invitation refusée",
  invitation_expired: "Invitation expirée",
  access_granted: "Accès accordé",
  access_revoked: "Accès révoqué",
  document_generated: "Dossier généré",
};

function orgInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function frDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR");
}

function eventDates(org: OrganizationInteractionCard): {
  granted: string | null;
  lastActivity: string | null;
} {
  const sorted = [...org.events].sort(
    (a, b) =>
      new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );
  const granted = sorted.find((e) => e.type === "access_granted");
  return {
    granted: granted ? frDate(granted.occurred_at) : null,
    lastActivity: sorted[0] ? relativeDate(sorted[0].occurred_at) : null,
  };
}

export default function AccessPage() {
  const {
    data: invitations,
    loading: invLoading,
    error: invError,
    refetch: refetchInvitations,
  } = useAsyncData<Invitation[]>(
    () => api.get("/invitations/me"),
    "Impossible de charger les invitations",
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: orgs,
    loading: orgsLoading,
    error: orgsError,
    refetch: refetchOrgs,
  } = useAsyncData<OrganizationInteractionCard[]>(
    () => api.get("/candidates/me/organizations"),
    "Impossible de charger les accès",
  );

  const { data: docs } = useAsyncData<GeneratedDocumentCandidateView[]>(
    () => api.get("/candidates/me/documents"),
    "Impossible de charger les dossiers",
  );

  const [revoking, setRevoking] = useState<string | null>(null);
  const { download, errors: downloadErrors } = useDownload();

  const loading = invLoading || orgsLoading;
  const pendingInvitations = (invitations ?? []).filter(
    (inv) => inv.status === "pending",
  );
  const pastInvitations = (invitations ?? []).filter(
    (inv) => inv.status !== "pending",
  );

  async function respond(token: string, action: "accept" | "reject") {
    setActionError(null);
    try {
      await api.post(`/invitations/${token}/${action}`);
      refetchInvitations();
      refetchOrgs();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.detail : "Erreur");
    }
  }

  async function handleRevoke(orgId: string) {
    setRevoking(orgId);
    try {
      await api.post("/access-grants/revoke", { organization_id: orgId });
      refetchOrgs();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.detail : "Erreur lors de la révocation",
      );
    } finally {
      setRevoking(null);
    }
  }

  if (loading) {
    return (
      <div className="w-full space-y-[18px] animate-pulse">
        <div className="h-20 rounded-lg bg-muted" />
        <div className="h-72 rounded-lg bg-muted" />
        <div className="grid grid-cols-1 gap-[18px] xl:grid-cols-[1.5fr_1fr]">
          <div className="h-56 rounded-lg bg-muted" />
          <div className="h-56 rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  const orgList = orgs ?? [];
  const activeCount = orgList.filter(
    (o) => o.current_status === "active",
  ).length;
  const revokedCount = orgList.filter(
    (o) => o.current_status === "revoked",
  ).length;
  const journal = orgList
    .flatMap((o) =>
      o.events.map((event) => ({ event, orgName: o.organization_name })),
    )
    .sort(
      (a, b) =>
        new Date(b.event.occurred_at).getTime() -
        new Date(a.event.occurred_at).getTime(),
    )
    .slice(0, 6);
  const docList = docs ?? [];

  return (
    <div className="flex w-full flex-col gap-[18px]">
      <header>
        <p className="j-overline">
          {activeCount} accès actif{activeCount > 1 ? "s" : ""}
        </p>
        <h1 className="mt-2 font-heading text-[27px] font-semibold leading-tight">
          Accès &amp; partages
        </h1>
        <p className="mt-1 max-w-[620px] text-[15px] text-ink-2">
          Contrôlez les organisations autorisées à consulter votre profil
          structuré et suivez les dossiers générés à partir de vos données.
        </p>
      </header>

      <ErrorAlert error={invError ?? orgsError ?? actionError} />

      {/* Demandes en attente */}
      {pendingInvitations.map((inv) => (
        <section
          key={inv.id}
          className="rounded-lg border border-accent-line bg-accent-soft-2 px-[22px] py-4"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <span className="grid size-[38px] shrink-0 place-items-center rounded-[10px] border border-accent-line bg-accent-soft text-primary">
              <Bell className="size-[17px]" strokeWidth={1.6} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-semibold">
                {inv.organization_name ?? "Une organisation"} demande
                l&apos;accès à votre profil structuré
              </p>
              <p className="mt-px text-[13px] text-ink-2">
                Demande reçue le {frDate(inv.created_at)} · expire le{" "}
                {frDate(inv.expires_at)} · rien n&apos;est partagé sans votre
                accord.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => respond(inv.token, "reject")}
              >
                Refuser
              </Button>
              <Button size="sm" onClick={() => respond(inv.token, "accept")}>
                <Check className="size-4" strokeWidth={1.6} />
                Autoriser
              </Button>
            </div>
          </div>
        </section>
      ))}

      {/* Registre des accès */}
      <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-[18px]">
          <h2 className="font-heading text-[17px] font-semibold">
            Registre des accès
          </h2>
          <div className="flex gap-2">
            {activeCount > 0 && (
              <StatusPill tone="positive">
                {activeCount} actif{activeCount > 1 ? "s" : ""}
              </StatusPill>
            )}
            {revokedCount > 0 && (
              <StatusPill tone="muted">
                {revokedCount} révoqué{revokedCount > 1 ? "s" : ""}
              </StatusPill>
            )}
          </div>
        </div>
        {orgList.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              message="Aucune organisation n'a accès à votre profil."
              description="Les recruteurs apparaîtront ici uniquement après une invitation acceptée. Vous pourrez ensuite suivre les accès, les actions et les dossiers générés à partir de vos données."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {[
                    "Organisation",
                    "Accordé le",
                    "Dernière activité",
                    "Statut",
                    "",
                  ].map((label, i) => (
                    <th
                      key={i}
                      className="border-b border-line px-4 pb-3 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-4"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orgList.map((org) => {
                  const pill =
                    ORG_STATUS_PILLS[org.current_status] ??
                    ORG_STATUS_PILLS.invited;
                  const inactive =
                    org.current_status === "revoked" ||
                    org.current_status === "expired";
                  const { granted, lastActivity } = eventDates(org);
                  return (
                    <tr
                      key={org.organization_id}
                      className={cn(
                        "border-b border-line last:border-b-0",
                        inactive && "opacity-55",
                      )}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-[11px]">
                          <span className="grid size-[30px] place-items-center rounded-[7px] border border-line bg-paper-2 font-heading text-[13px] font-semibold text-ink-2">
                            {orgInitials(org.organization_name)}
                          </span>
                          <span className="whitespace-nowrap text-sm font-medium">
                            {org.organization_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="j-meta text-[12.5px]">
                          {granted ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="j-meta text-[12.5px]">
                          {lastActivity ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {org.current_status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-ink-2"
                            disabled={revoking === org.organization_id}
                            onClick={() => handleRevoke(org.organization_id)}
                          >
                            {revoking === org.organization_id
                              ? "Révocation…"
                              : "Révoquer"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Invitations passées */}
      {pastInvitations.length > 0 && (
        <section className="rounded-lg border border-line bg-surface">
          <div className="px-5 pb-2 pt-[18px]">
            <h2 className="font-heading text-[17px] font-semibold">
              Invitations passées
            </h2>
          </div>
          {pastInvitations.map((inv) => {
            const pill =
              PAST_INVITATION_PILLS[inv.status] ??
              PAST_INVITATION_PILLS.expired;
            return (
              <div
                key={inv.id}
                className="flex items-center gap-3 border-t border-line px-5 py-3 opacity-55"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {inv.organization_name ??
                    `Organisation ${inv.organization_id.slice(0, 8)}…`}
                </span>
                <span className="j-meta text-[12.5px]">
                  {frDate(inv.created_at)}
                </span>
                <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
              </div>
            );
          })}
        </section>
      )}

      {/* Bas : dossiers générés + journal */}
      <section className="grid grid-cols-1 gap-[18px] xl:grid-cols-[1.5fr_1fr]">
        <article className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
          <div className="flex items-center justify-between gap-3 px-5 pb-3.5 pt-[18px]">
            <h2 className="font-heading text-[17px] font-semibold">
              Dossiers générés depuis vos données
            </h2>
            <span className="j-meta text-[11.5px]">
              {docList.length} dossier{docList.length > 1 ? "s" : ""}
            </span>
          </div>
          {docList.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-ink-3">
              Lorsqu&apos;un recruteur générera un dossier depuis votre profil,
              il apparaîtra ici avec son modèle et sa date.
            </p>
          ) : (
            docList.map((doc) => {
              const recruiter = [
                doc.recruiter_first_name,
                doc.recruiter_last_name,
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 border-t border-line px-5 py-[13px]"
                >
                  <span className="grid size-[30px] shrink-0 place-items-center rounded-[7px] border border-line bg-paper-2 text-ink-3">
                    <FolderOpen className="size-[15px]" strokeWidth={1.6} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {doc.template_name ?? "Dossier"} — {doc.organization_name}
                    </p>
                    <p className="text-xs text-ink-3">
                      {recruiter ? `généré par ${recruiter} · ` : ""}
                      <span className="font-mono">
                        {frDate(doc.generated_at)}
                      </span>
                      {" · "}
                      <span className="font-mono uppercase">
                        {doc.file_format}
                      </span>
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Télécharger le dossier"
                    onClick={() =>
                      download(
                        `/documents/${doc.id}/download`,
                        `dossier-${doc.id}.${doc.file_format}`,
                        doc.id,
                      )
                    }
                  >
                    <Download className="size-4" strokeWidth={1.6} />
                  </Button>
                </div>
              );
            })
          )}
          {Object.entries(downloadErrors).map(([id, err]) => (
            <div key={id} className="px-5 pb-3">
              <ErrorAlert error={err} />
            </div>
          ))}
        </article>

        <article className="flex min-w-0 flex-col rounded-lg border border-line bg-surface px-[22px] py-[18px]">
          <h2 className="font-heading text-[17px] font-semibold">Journal</h2>
          {journal.length === 0 ? (
            <p className="py-3 text-sm text-ink-3">
              Les invitations, accès et dossiers générés apparaîtront ici.
            </p>
          ) : (
            <div className="flex flex-col">
              {journal.map(({ event, orgName }, i) => {
                const Icon = JOURNAL_ICONS[event.type] ?? Eye;
                const accent =
                  event.type === "access_granted" ||
                  event.type === "document_generated";
                return (
                  <div key={i} className="relative flex gap-3.5 py-3.5">
                    {i < journal.length - 1 && (
                      <span
                        className="absolute bottom-[-2px] left-3.5 top-8 w-px bg-line"
                        aria-hidden
                      />
                    )}
                    <span
                      className={cn(
                        "z-10 grid size-[29px] shrink-0 place-items-center rounded-lg border",
                        accent
                          ? "border-accent-line bg-accent-soft text-primary"
                          : "border-line bg-paper-2 text-ink-3",
                      )}
                    >
                      <Icon className="size-3.5" strokeWidth={1.6} />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-sm">
                        <b className="font-semibold">{orgName}</b> ·{" "}
                        {JOURNAL_LABELS[event.type]}
                      </p>
                      <p className="mt-0.5 font-mono text-[11.5px] text-ink-4">
                        {relativeDate(event.occurred_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="j-meta mt-auto flex items-center gap-2 pt-3 text-[11.5px]">
            <ShieldCheck className="size-[13px]" strokeWidth={1.6} />
            Chaque accès est révocable à tout moment.
          </p>
        </article>
      </section>
    </div>
  );
}
