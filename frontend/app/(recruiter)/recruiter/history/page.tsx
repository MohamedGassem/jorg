// frontend/app/(recruiter)/history/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { GeneratedDocument, RecruiterProfile } from "@/types/api";

export default function RecruiterHistoryPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [docs, setDocs] = useState<GeneratedDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<RecruiterProfile>("/recruiters/me/profile").then((p) => {
      setOrgId(p.organization_id);
      if (p.organization_id) {
        return api.get<GeneratedDocument[]>(`/organizations/${p.organization_id}/documents`);
      }
      return [];
    }).then(setDocs).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;
  if (!orgId) return <p className="text-muted-foreground">Associez votre compte à une organisation.</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Dossiers générés</h1>
      {docs.length === 0 ? (
        <p className="text-muted-foreground">Aucun dossier généré par votre organisation.</p>
      ) : (
        <ul className="space-y-3" role="list">
          {docs.map((doc) => (
            <li key={doc.id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {new Date(doc.generated_at).toLocaleString("fr-FR")}
                    </CardTitle>
                    <Badge variant="secondary">{doc.file_format.toUpperCase()}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button size="sm" variant="outline" asChild>
                    <a href={api.downloadUrl(`/documents/${doc.id}/download`)} download>
                      Télécharger
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
