"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useDownload, useRecruiterOrg } from "@/lib/hooks";
import type { GeneratedDocumentRecruiterView, Template } from "@/types/api";

type DocTab = "dossiers" | "templates";

function DocumentCard({
  doc,
  onDownload,
}: {
  doc: GeneratedDocumentRecruiterView;
  onDownload: () => void;
}) {
  const candidateName =
    [doc.candidate_first_name, doc.candidate_last_name]
      .filter(Boolean)
      .join(" ") || "Candidat inconnu";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{candidateName}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {new Date(doc.generated_at).toLocaleString("fr-FR")}
              {doc.opportunity_title && ` · ${doc.opportunity_title}`}
            </p>
          </div>
          {doc.file_format && (
            <Badge variant="secondary">{doc.file_format.toUpperCase()}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Button size="sm" variant="outline" onClick={onDownload}>
          Télécharger
        </Button>
      </CardContent>
    </Card>
  );
}

export default function DocumentsPage() {
  const { orgId, loading: orgLoading, error: orgError } = useRecruiterOrg();
  const [activeTab, setActiveTab] = useState<DocTab>("dossiers");
  const [docs, setDocs] = useState<GeneratedDocumentRecruiterView[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { download, errors: downloadErrors } = useDownload();

  useEffect(() => {
    if (!orgId) return;
    const controller = new AbortController();
    setDocsLoading(true);
    Promise.all([
      api
        .get<GeneratedDocumentRecruiterView[]>(
          `/organizations/${orgId}/documents`,
        )
        .then((data) => {
          if (!controller.signal.aborted) setDocs(data);
        })
        .catch((err) => {
          if (!controller.signal.aborted)
            setFetchError(
              extractErrorMessage(err, "Impossible de charger les dossiers"),
            );
        }),
      api
        .get<Template[]>(`/organizations/${orgId}/templates`)
        .then((data) => {
          if (!controller.signal.aborted) setTemplates(data);
        })
        .catch(() => {
          // Templates are optional — documents tab still works without them
        }),
    ]).finally(() => {
      if (!controller.signal.aborted) setDocsLoading(false);
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

  const tabs: { key: DocTab; label: string }[] = [
    { key: "dossiers", label: "Dossiers générés" },
    { key: "templates", label: "Templates" },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Dossiers</h1>
      <ErrorAlert error={orgError ?? fetchError} />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Dossiers tab */}
      {activeTab === "dossiers" && (
        <>
          {docs.length === 0 ? (
            <EmptyState message="Aucun dossier généré par votre organisation." />
          ) : (
            <ul className="space-y-3" role="list">
              {docs.map((doc) => (
                <li key={doc.id}>
                  <DocumentCard
                    doc={doc}
                    onDownload={() =>
                      download(
                        `/documents/${doc.id}/download`,
                        `dossier.${doc.file_format}`,
                        doc.id,
                      )
                    }
                  />
                  <ErrorAlert error={downloadErrors[doc.id] ?? null} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Templates tab */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {templates.length} template{templates.length !== 1 ? "s" : ""}
            </p>
            <Link
              href="/recruiter/templates"
              className="text-sm font-medium text-primary hover:underline"
            >
              Gérer les templates →
            </Link>
          </div>
          {templates.length === 0 ? (
            <EmptyState message="Aucun template. Cliquez sur «Gérer les templates» pour en créer." />
          ) : (
            <ul className="space-y-2" role="list">
              {templates.map((t) => (
                <li key={t.id} className="rounded-lg border p-3 text-sm">
                  <span className="font-medium">{t.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
