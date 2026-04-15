// frontend/app/(candidate)/history/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { GeneratedDocument } from "@/types/api";

export default function HistoryPage() {
  const [docs, setDocs] = useState<GeneratedDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<GeneratedDocument[]>("/candidates/me/documents")
      .then(setDocs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Dossiers générés</h1>
      {docs.length === 0 ? (
        <p className="text-muted-foreground">Aucun dossier généré pour l&apos;instant.</p>
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
                  <a href={api.downloadUrl(`/documents/${doc.id}/download`)} download>
                    <Button size="sm" variant="outline">
                      Télécharger
                    </Button>
                  </a>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
