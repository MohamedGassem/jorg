// frontend/app/(candidate)/candidate/access/page.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api, ApiError } from "@/lib/api";
import {
  ACCESS_STATUS_LABELS,
  ACCESS_STATUS_VARIANTS,
  EVENT_LABELS,
  INVITATION_STATUS_LABELS,
  INVITATION_STATUS_VARIANTS,
} from "@/lib/labels";
import { useAsyncData, useDownload } from "@/lib/hooks";
import type {
  GeneratedDocumentCandidateView,
  Invitation,
  OrganizationInteractionCard,
} from "@/types/api";

function docRelativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} jours`;
  return new Date(dateStr).toLocaleDateString("fr-FR");
}

function DocCard({
  doc,
  onDownload,
}: {
  doc: GeneratedDocumentCandidateView;
  onDownload: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const recruiterName = [doc.recruiter_first_name, doc.recruiter_last_name]
    .filter(Boolean)
    .join(" ");
  const displayName = recruiterName
    ? doc.organization_name
      ? `${recruiterName} de ${doc.organization_name}`
      : recruiterName
    : doc.organization_name;

  const relativeDate = docRelativeDate(doc.generated_at);

  return (
    <div className="rounded-lg border bg-card">
      <button
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
        onClick={() => setExpanded((p) => !p)}
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <p className="text-xs text-muted-foreground">{relativeDate}</p>
        </div>
        <span className="shrink-0 text-muted-foreground">
          {expanded ? "▾" : "▸"}
        </span>
      </button>
      {expanded && (
        <div className="space-y-2 border-t px-4 py-3">
          {doc.template_name && (
            <p className="text-xs text-muted-foreground">
              Modele de dossier : {doc.template_name}
            </p>
          )}
          <Button size="sm" variant="outline" onClick={onDownload}>
            Télécharger
          </Button>
        </div>
      )}
    </div>
  );
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
  const [revoking, setRevoking] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [docsExpanded, setDocsExpanded] = useState<Record<string, boolean>>({});

  const [orgDocs, setOrgDocs] = useState<
    Record<string, GeneratedDocumentCandidateView[]>
  >({});
  const [docsLoading, setDocsLoading] = useState<Record<string, boolean>>({});
  const { download, errors: downloadErrors } = useDownload();

  const loading = invLoading || orgsLoading;
  const pendingInvitations = (invitations ?? []).filter(
    (inv) => inv.status === "pending",
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

  async function loadOrgDocs(orgId: string) {
    if (orgDocs[orgId] !== undefined) return;
    setDocsLoading((prev) => ({ ...prev, [orgId]: true }));
    try {
      const all = await api.get<GeneratedDocumentCandidateView[]>(
        "/candidates/me/documents",
      );
      const byOrg: Record<string, GeneratedDocumentCandidateView[]> = {};
      for (const doc of all) {
        if (!doc.organization_id) continue;
        byOrg[doc.organization_id] = [
          ...(byOrg[doc.organization_id] ?? []),
          doc,
        ];
      }
      setOrgDocs((prev) => ({ ...prev, ...byOrg }));
    } catch {
      // ignore - docs are a nice-to-have
    } finally {
      setDocsLoading((prev) => ({ ...prev, [orgId]: false }));
    }
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Accès à votre profil</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contrôlez les organisations autorisées à consulter votre profil
          structuré et suivez les dossiers générés à partir de vos données.
        </p>
      </div>
      <ErrorAlert error={invError ?? orgsError ?? actionError} />

      {/* Pending invitations - shown prominently */}
      {pendingInvitations.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-warning">
            <span className="inline-block h-2 w-2 rounded-full bg-warning" />
            {pendingInvitations.length} invitation
            {pendingInvitations.length > 1 ? "s" : ""} en attente
          </h2>
          <ul className="space-y-3" role="list">
            {pendingInvitations.map((inv) => (
              <li key={inv.id}>
                <Card className="border-warning/30 bg-warning/10">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">
                        {inv.organization_name ??
                          `Organisation ${inv.organization_id.slice(0, 8)}…`}
                      </CardTitle>
                      <StatusBadge
                        status={inv.status}
                        labels={INVITATION_STATUS_LABELS}
                        variants={INVITATION_STATUS_VARIANTS}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Cette organisation demande à consulter votre profil
                      structuré. Vous gardez la possibilité de révoquer
                      l&apos;accès après acceptation. Expire le{" "}
                      {new Date(inv.expires_at).toLocaleDateString("fr-FR")}.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => respond(inv.token, "accept")}
                      >
                        Accepter
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => respond(inv.token, "reject")}
                      >
                        Refuser
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Historical invitations (non-pending) */}
      {(invitations ?? []).filter((inv) => inv.status !== "pending").length >
        0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Invitations passées
          </h2>
          <ul className="space-y-2" role="list">
            {(invitations ?? [])
              .filter((inv) => inv.status !== "pending")
              .map((inv) => (
                <li key={inv.id}>
                  <div className="flex items-center justify-between rounded-lg border border-border/40 bg-card px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">
                        {inv.organization_name ??
                          `Organisation ${inv.organization_id.slice(0, 8)}…`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(inv.created_at).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                    <StatusBadge
                      status={inv.status}
                      labels={INVITATION_STATUS_LABELS}
                      variants={INVITATION_STATUS_VARIANTS}
                    />
                  </div>
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* All organisations */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Organisations autorisées
        </h2>
        {!orgs || orgs.length === 0 ? (
          <EmptyState
            message="Aucune organisation n'a accès à votre profil."
            description="Les recruteurs apparaîtront ici uniquement après une invitation acceptée. Vous pourrez ensuite suivre les accès, les actions et les dossiers générés à partir de vos données."
          />
        ) : (
          <ul className="space-y-4" role="list">
            {orgs.map((org) => {
              const docs = orgDocs[org.organization_id] ?? [];
              return (
                <li key={org.organization_id}>
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">
                          {org.organization_name}
                        </CardTitle>
                        <StatusBadge
                          status={org.current_status}
                          labels={ACCESS_STATUS_LABELS}
                          variants={ACCESS_STATUS_VARIANTS}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Events history */}
                      <div>
                        <button
                          type="button"
                          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                          onClick={() =>
                            setExpanded((prev) => ({
                              ...prev,
                              [org.organization_id]: !prev[org.organization_id],
                            }))
                          }
                        >
                          Historique ({org.events.length} événement
                          {org.events.length > 1 ? "s" : ""})
                        </button>
                        {expanded[org.organization_id] && (
                          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                            {org.events.map((ev, i) => (
                              <li
                                key={i}
                                className="flex items-start justify-between gap-2"
                              >
                                <span>{EVENT_LABELS[ev.type] ?? ev.type}</span>
                                <span className="shrink-0 text-xs">
                                  {new Date(ev.occurred_at).toLocaleDateString(
                                    "fr-FR",
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Dossiers générés */}
                      <div>
                        <button
                          type="button"
                          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                          onClick={() => {
                            const next = !docsExpanded[org.organization_id];
                            setDocsExpanded((prev) => ({
                              ...prev,
                              [org.organization_id]: next,
                            }));
                            if (next) void loadOrgDocs(org.organization_id);
                          }}
                        >
                          Dossiers générés depuis votre profil
                          {docsLoading[org.organization_id]
                            ? " (chargement…)"
                            : ""}
                        </button>
                        {docsExpanded[org.organization_id] &&
                          !docsLoading[org.organization_id] && (
                            <div className="mt-2">
                              {docs.length === 0 ? (
                                <EmptyState
                                  message="Aucun dossier généré pour cette organisation."
                                  description="Lorsqu'un recruteur générera un dossier depuis votre profil, il apparaîtra ici avec son modèle et sa date."
                                  className="px-4 py-4"
                                />
                              ) : (
                                <div className="space-y-2">
                                  {docs.map((doc) => (
                                    <DocCard
                                      key={doc.id}
                                      doc={doc}
                                      onDownload={() =>
                                        download(
                                          `/documents/${doc.id}/download`,
                                          `dossier-${doc.id}.${doc.file_format}`,
                                          doc.id,
                                        )
                                      }
                                    />
                                  ))}
                                </div>
                              )}
                              {Object.entries(downloadErrors).map(
                                ([id, err]) => (
                                  <ErrorAlert key={id} error={err} />
                                ),
                              )}
                            </div>
                          )}
                      </div>

                      {org.current_status === "active" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={revoking === org.organization_id}
                          onClick={() => handleRevoke(org.organization_id)}
                        >
                          {revoking === org.organization_id
                            ? "Révocation…"
                            : "Révoquer l'accès"}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
