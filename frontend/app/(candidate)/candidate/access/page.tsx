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

  async function loadOrgDocs(orgName: string) {
    if (orgDocs[orgName] !== undefined) return;
    setDocsLoading((prev) => ({ ...prev, [orgName]: true }));
    try {
      const all = await api.get<GeneratedDocumentCandidateView[]>(
        "/candidates/me/documents",
      );
      const byOrg: Record<string, GeneratedDocumentCandidateView[]> = {};
      for (const doc of all) {
        byOrg[doc.organization_name] = [
          ...(byOrg[doc.organization_name] ?? []),
          doc,
        ];
      }
      setOrgDocs((prev) => ({ ...prev, ...byOrg }));
    } catch {
      // ignore — docs are a nice-to-have
    } finally {
      setDocsLoading((prev) => ({ ...prev, [orgName]: false }));
    }
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Accès</h1>
      <ErrorAlert error={invError ?? orgsError ?? actionError} />

      {/* Pending invitations — shown prominently */}
      {pendingInvitations.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-600">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            {pendingInvitations.length} invitation
            {pendingInvitations.length > 1 ? "s" : ""} en attente
          </h2>
          <ul className="space-y-3" role="list">
            {pendingInvitations.map((inv) => (
              <li key={inv.id}>
                <Card className="border-amber-200 bg-amber-50/30">
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
                      Expire le{" "}
                      {new Date(inv.expires_at).toLocaleDateString("fr-FR")}
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

      {/* All organisations */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Organisations
        </h2>
        {!orgs || orgs.length === 0 ? (
          <EmptyState message="Aucune interaction avec une organisation pour l'instant." />
        ) : (
          <ul className="space-y-4" role="list">
            {orgs.map((org) => {
              const docs = orgDocs[org.organization_name] ?? [];
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
                            const next = !docsExpanded[org.organization_name];
                            setDocsExpanded((prev) => ({
                              ...prev,
                              [org.organization_name]: next,
                            }));
                            if (next) void loadOrgDocs(org.organization_name);
                          }}
                        >
                          Dossiers générés
                          {docsLoading[org.organization_name]
                            ? " (chargement…)"
                            : ""}
                        </button>
                        {docsExpanded[org.organization_name] &&
                          !docsLoading[org.organization_name] && (
                            <div className="mt-2">
                              {docs.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  Aucun dossier.
                                </p>
                              ) : (
                                <ul className="space-y-1">
                                  {docs.map((doc) => (
                                    <li
                                      key={doc.id}
                                      className="flex items-center justify-between gap-2 rounded border border-border/40 px-3 py-2"
                                    >
                                      <span className="text-xs text-muted-foreground">
                                        {new Date(
                                          doc.generated_at,
                                        ).toLocaleDateString("fr-FR")}{" "}
                                        · {doc.file_format.toUpperCase()} ·{" "}
                                        {doc.template_name}
                                      </span>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs"
                                        onClick={() =>
                                          download(
                                            `/documents/${doc.id}/download`,
                                            `dossier.${doc.file_format}`,
                                            doc.id,
                                          )
                                        }
                                      >
                                        Télécharger
                                      </Button>
                                    </li>
                                  ))}
                                </ul>
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
