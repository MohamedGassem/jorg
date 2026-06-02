"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api, ApiError } from "@/lib/api";
import { useAsyncData } from "@/lib/hooks";
import type { OrganizationInteractionCard } from "@/types/api";
import {
  ACCESS_STATUS_LABELS as STATUS_LABELS,
  ACCESS_STATUS_VARIANTS as STATUS_VARIANTS,
  EVENT_LABELS,
} from "@/lib/labels";

export default function AccessPage() {
  const {
    data: orgs,
    loading,
    error,
    refetch,
  } = useAsyncData<OrganizationInteractionCard[]>(
    () => api.get("/candidates/me/organizations"),
    "Impossible de charger les accès",
  );
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  async function handleRevoke(orgId: string) {
    setRevokeError(null);
    setRevoking(orgId);
    try {
      await api.post(`/access-grants/revoke`, { organization_id: orgId });
      refetch();
    } catch (err) {
      setRevokeError(
        err instanceof ApiError ? err.detail : "Erreur lors de la révocation",
      );
    } finally {
      setRevoking(null);
    }
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Accès & interactions</h1>
      <ErrorAlert error={error} />
      <ErrorAlert error={revokeError} />
      {!orgs || orgs.length === 0 ? (
        <EmptyState message="Aucune interaction avec une organisation pour l'instant." />
      ) : (
        <ul className="space-y-4" role="list">
          {orgs.map((org) => (
            <li key={org.organization_id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {org.organization_name}
                    </CardTitle>
                    <StatusBadge
                      status={org.current_status}
                      labels={STATUS_LABELS}
                      variants={STATUS_VARIANTS}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
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
          ))}
        </ul>
      )}
    </div>
  );
}
