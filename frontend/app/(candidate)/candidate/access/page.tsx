// frontend/app/(candidate)/access/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import type { AccessGrant } from "@/types/api";

export default function AccessPage() {
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<AccessGrant[]>("/access/me")
      .then(setGrants)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function revoke(grantId: string) {
    setRevoking(grantId);
    setError(null);
    try {
      const updated = await api.delete<AccessGrant>(`/access/me/${grantId}`);
      setGrants((prev) => prev.map((g) => (g.id === grantId ? updated : g)));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Erreur lors de la révocation");
    } finally {
      setRevoking(null);
    }
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Accès accordés</h1>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {grants.length === 0 ? (
        <p className="text-muted-foreground">Vous n&apos;avez accordé l&apos;accès à aucune organisation.</p>
      ) : (
        <ul className="space-y-3" role="list">
          {grants.map((grant) => (
            <li key={grant.id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">
                      Organisation {grant.organization_id.slice(0, 8)}…
                    </CardTitle>
                    <Badge variant={grant.status === "active" ? "default" : "secondary"}>
                      {grant.status === "active" ? "Actif" : "Révoqué"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-sm text-muted-foreground">
                    Accordé le {new Date(grant.granted_at).toLocaleDateString("fr-FR")}
                  </p>
                  {grant.status === "active" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={revoking === grant.id}
                      onClick={() => revoke(grant.id)}
                    >
                      {revoking === grant.id ? "Révocation…" : "Révoquer l'accès"}
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
