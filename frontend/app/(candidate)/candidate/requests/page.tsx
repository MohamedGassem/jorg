// frontend/app/(candidate)/requests/page.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api, ApiError } from "@/lib/api";
import { useAsyncData } from "@/lib/hooks";
import type { Invitation } from "@/types/api";

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  rejected: "Refusée",
  expired: "Expirée",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive"> =
  {
    pending: "default",
    accepted: "secondary",
    rejected: "destructive",
    expired: "secondary",
  };

export default function RequestsPage() {
  const {
    data: invitations,
    loading,
    error,
    refetch,
  } = useAsyncData<Invitation[]>(
    () => api.get("/invitations/me"),
    "Impossible de charger les invitations",
  );
  const [actionError, setActionError] = useState<string | null>(null);

  async function respond(token: string, action: "accept" | "reject") {
    setActionError(null);
    try {
      await api.post(`/invitations/${token}/${action}`);
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.detail : "Erreur");
    }
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Invitations reçues</h1>
      <ErrorAlert error={error} />
      <ErrorAlert error={actionError} />
      {!invitations || invitations.length === 0 ? (
        <EmptyState message="Aucune invitation pour l'instant." />
      ) : (
        <ul className="space-y-3" role="list">
          {invitations.map((inv) => (
            <li key={inv.id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">
                      Organisation {inv.organization_id.slice(0, 8)}…
                    </CardTitle>
                    <StatusBadge
                      status={inv.status}
                      labels={STATUS_LABELS}
                      variants={STATUS_VARIANTS}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Expire le{" "}
                    {new Date(inv.expires_at).toLocaleDateString("fr-FR")}
                  </p>
                  {inv.status === "pending" && (
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
