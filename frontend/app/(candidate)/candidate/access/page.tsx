// frontend/app/(candidate)/candidate/access/page.tsx
"use client";

import { Fragment, useState } from "react";
import {
  Bell,
  Check,
  Download,
  Eye,
  FolderOpen,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { StatusPill } from "@/components/ui/StatusPill";
import { api, ApiError } from "@/lib/api";
import {
  EVENT_ICON_COMPONENTS,
  EVENT_LABELS,
  INVITATION_PILLS,
  ORG_STATUS_PILLS,
  downloadFilename,
  frDate,
  initialsFromName,
  relativeDate,
} from "@/lib/labels";
import { useAsyncData, useDownload } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type {
  AcceptInvitationRequest,
  AccessGrant,
  GeneratedDocumentCandidateView,
  Invitation,
  OrganizationInteractionCard,
} from "@/types/api";

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
  const [consent, setConsent] = useState<
    Record<string, AcceptInvitationRequest>
  >({});

  function invitationConsent(id: string): AcceptInvitationRequest {
    return consent[id] ?? { share_finances: true, share_contact: true };
  }

  function setConsentField(
    id: string,
    field: keyof AcceptInvitationRequest,
    value: boolean,
  ) {
    setConsent((prev) => ({
      ...prev,
      [id]: { ...invitationConsent(id), [field]: value },
    }));
  }

  const {
    data: orgs,
    loading: orgsLoading,
    error: orgsError,
    refetch: refetchOrgs,
  } = useAsyncData<OrganizationInteractionCard[]>(
    () => api.get("/candidates/me/organizations"),
    "Impossible de charger les accès",
  );

  const { data: docs, error: docsError } = useAsyncData<
    GeneratedDocumentCandidateView[]
  >(
    () => api.get("/candidates/me/documents"),
    "Impossible de charger les dossiers",
  );

  const [revoking, setRevoking] = useState<string | null>(null);
  const { download, errors: downloadErrors } = useDownload();

  const { data: grants, refetch: refetchGrants } = useAsyncData<AccessGrant[]>(
    () => api.get("/access/me"),
    "Impossible de charger les partages",
  );
  const activeGrantByOrg = new Map<string, AccessGrant>();
  for (const g of grants ?? []) {
    if (g.status === "active") activeGrantByOrg.set(g.organization_id, g);
  }
  const [editingGrant, setEditingGrant] = useState<string | null>(null);
  const [scopeDraft, setScopeDraft] = useState<AcceptInvitationRequest>({
    share_finances: true,
    share_contact: true,
  });
  const [savingScopes, setSavingScopes] = useState(false);

  function startEditScopes(grant: AccessGrant) {
    setEditingGrant(grant.id);
    setScopeDraft({
      share_finances: grant.share_finances,
      share_contact: grant.share_contact,
    });
  }

  async function saveScopes(grantId: string) {
    setSavingScopes(true);
    setActionError(null);
    try {
      await api.patch(`/access/me/${grantId}`, scopeDraft);
      setEditingGrant(null);
      refetchGrants();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.detail : "Erreur");
    } finally {
      setSavingScopes(false);
    }
  }

  const loading = invLoading || orgsLoading;
  const pendingInvitations = (invitations ?? []).filter(
    (inv) => inv.status === "pending",
  );
  const pastInvitations = (invitations ?? []).filter(
    (inv) => inv.status !== "pending",
  );

  async function respond(
    token: string,
    action: "accept" | "reject",
    scopes?: AcceptInvitationRequest,
  ) {
    setActionError(null);
    try {
      await api.post(
        `/invitations/${token}/${action}`,
        action === "accept" ? scopes : undefined,
      );
      refetchInvitations();
      refetchOrgs();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.detail : "Erreur");
    }
  }

  async function handleRevoke(orgId: string) {
    setRevoking(orgId);
    setActionError(null);
    try {
      const grants = await api.get<AccessGrant[]>("/access/me");
      const grant = grants.find(
        (g) => g.organization_id === orgId && g.status === "active",
      );
      if (!grant) {
        throw new ApiError(404, "Aucun accès actif pour cette organisation.");
      }
      await api.delete(`/access/me/${grant.id}`);
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
  // Full consultation history — kept complete (not capped) so the
  // traceability promise holds; the list scrolls within its column.
  const journal = orgList
    .flatMap((o) =>
      o.events.map((event) => ({ event, orgName: o.organization_name })),
    )
    .sort(
      (a, b) =>
        new Date(b.event.occurred_at).getTime() -
        new Date(a.event.occurred_at).getTime(),
    );
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

      <ErrorAlert error={invError ?? orgsError ?? docsError ?? actionError} />

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
              <div className="mt-3 flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-[13px] text-ink-2">
                  <Checkbox
                    checked={invitationConsent(inv.id).share_finances}
                    onCheckedChange={(v) =>
                      setConsentField(inv.id, "share_finances", v)
                    }
                  />
                  Partager mon TJM / ma rémunération
                </label>
                <label className="flex items-center gap-2 text-[13px] text-ink-2">
                  <Checkbox
                    checked={invitationConsent(inv.id).share_contact}
                    onCheckedChange={(v) =>
                      setConsentField(inv.id, "share_contact", v)
                    }
                  />
                  Partager mes coordonnées (téléphone, email)
                </label>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => respond(inv.token, "reject")}
              >
                Refuser
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  respond(inv.token, "accept", invitationConsent(inv.id))
                }
              >
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
                    <th key={i} className="j-th">
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
                  const grant = activeGrantByOrg.get(org.organization_id);
                  return (
                    <Fragment key={org.organization_id}>
                      <tr
                        className={cn(
                          "border-b border-line last:border-b-0",
                          inactive && "opacity-55",
                          grant && editingGrant === grant.id && "border-b-0",
                        )}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-[11px]">
                            <span className="grid size-[30px] place-items-center rounded-[7px] border border-line bg-paper-2 font-heading text-[13px] font-semibold text-ink-2">
                              {initialsFromName(org.organization_name)}
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
                            <div className="flex justify-end gap-1">
                              {grant && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-ink-2"
                                  onClick={() =>
                                    editingGrant === grant.id
                                      ? setEditingGrant(null)
                                      : startEditScopes(grant)
                                  }
                                >
                                  Partage
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-ink-2"
                                disabled={revoking === org.organization_id}
                                onClick={() =>
                                  handleRevoke(org.organization_id)
                                }
                              >
                                {revoking === org.organization_id
                                  ? "Révocation…"
                                  : "Révoquer"}
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {grant && editingGrant === grant.id && (
                        <tr className="border-b border-line last:border-b-0">
                          <td colSpan={5} className="bg-paper-2 px-4 pb-4 pt-1">
                            <div className="flex flex-col gap-2.5">
                              <p className="j-meta text-[12px]">
                                Ce que cette organisation peut inclure dans un
                                dossier généré
                              </p>
                              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                                <Checkbox
                                  checked={scopeDraft.share_finances}
                                  onCheckedChange={(v) =>
                                    setScopeDraft((d) => ({
                                      ...d,
                                      share_finances: v,
                                    }))
                                  }
                                />
                                Partager mon TJM / ma rémunération
                              </label>
                              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                                <Checkbox
                                  checked={scopeDraft.share_contact}
                                  onCheckedChange={(v) =>
                                    setScopeDraft((d) => ({
                                      ...d,
                                      share_contact: v,
                                    }))
                                  }
                                />
                                Partager mes coordonnées (téléphone, email)
                              </label>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  disabled={savingScopes}
                                  onClick={() => saveScopes(grant.id)}
                                >
                                  {savingScopes
                                    ? "Enregistrement…"
                                    : "Enregistrer"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingGrant(null)}
                                >
                                  Annuler
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
              INVITATION_PILLS[inv.status] ?? INVITATION_PILLS.expired;
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
          {docsError ? (
            <p className="px-5 pb-5 text-sm text-ink-3">
              Impossible de charger vos dossiers générés pour le moment.
            </p>
          ) : docList.length === 0 ? (
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
                        downloadFilename(
                          [
                            doc.template_name ?? "dossier",
                            doc.organization_name,
                          ],
                          doc.file_format,
                        ),
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
            <div className="flex max-h-[420px] flex-col overflow-y-auto">
              {journal.map(({ event, orgName }, i) => {
                const Icon = EVENT_ICON_COMPONENTS[event.type] ?? Eye;
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
                        {EVENT_LABELS[event.type] ?? event.type}
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
