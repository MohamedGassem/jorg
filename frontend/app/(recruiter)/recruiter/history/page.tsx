// frontend/app/(recruiter)/history/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useDownload, useRecruiterOrg } from "@/lib/hooks";
import type { GeneratedDocument } from "@/types/api";

export default function RecruiterHistoryPage() {
  const { orgId, loading: orgLoading, error: orgError } = useRecruiterOrg();
  const [docs, setDocs] = useState<GeneratedDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { download, errors: downloadErrors } = useDownload();

  useEffect(() => {
    if (!orgId) return;
    const controller = new AbortController();
    Promise.resolve()
      .then(() => {
        setDocsLoading(true);
        return api.get<GeneratedDocument[]>(
          `/organizations/${orgId}/documents`,
        );
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setDocs(data);
          setDocsLoading(false);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setFetchError(
            extractErrorMessage(err, "Impossible de charger les dossiers"),
          );
          setDocsLoading(false);
        }
      });
    return () => controller.abort();
  }, [orgId]);

  if (orgLoading || docsLoading)
    return <p className="text-muted-foreground">Chargement…</p>;
  if (!orgId)
    return (
      <p className="text-muted-foreground">
        Associez votre compte à une organisation.
      </p>
    );

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Dossiers générés</h1>
      <ErrorAlert error={orgError ?? fetchError} />
      {docs.length === 0 ? (
        <EmptyState message="Aucun dossier généré par votre organisation." />
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
                    <Badge variant="secondary">
                      {doc.file_format.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button
                    size="sm"
                    variant="outline"
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
                  <ErrorAlert error={downloadErrors[doc.id] ?? null} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
