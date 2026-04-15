// frontend/app/(candidate)/requests/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import type { Invitation } from "@/types/api";

const statusLabel: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  rejected: "Refusée",
  expired: "Expirée",
};

const statusVariant: Record<string, "default" | "secondary" | "destructive"> = {
  pending: "default",
  accepted: "secondary",
  rejected: "destructive",
  expired: "secondary",
};

export default function RequestsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Invitation[]>("/invitations/me")
      .then(setInvitations)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function respond(token: string, action: "accept" | "reject") {
    setActionError(null);
    try {
      await api.post(`/invitations/${token}/${action}`);
      const updated = await api.get<Invitation[]>("/invitations/me");
      setInvitations(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.detail : "Erreur");
    }
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Invitations reçues</h1>
      {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      {invitations.length === 0 ? (
        <p className="text-muted-foreground">Aucune invitation pour l&apos;instant.</p>
      ) : (
        <ul className="space-y-3" role="list">
          {invitations.map((inv) => (
            <li key={inv.id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">Organisation {inv.organization_id.slice(0, 8)}…</CardTitle>
                    <Badge variant={statusVariant[inv.status] ?? "secondary"}>
                      {statusLabel[inv.status] ?? inv.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Expire le {new Date(inv.expires_at).toLocaleDateString("fr-FR")}
                  </p>
                  {inv.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => respond(inv.token, "accept")}>
                        Accepter
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => respond(inv.token, "reject")}>
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
