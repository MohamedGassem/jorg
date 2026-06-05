"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TabBar } from "@/components/ui/TabBar";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useDownload, useRecruiterOrg } from "@/lib/hooks";
import type {
  BuiltinTemplate,
  GeneratedDocumentRecruiterView,
  Template,
} from "@/types/api";

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
              {doc.opportunity_title && ` - ${doc.opportunity_title}`}
            </p>
            {doc.template_name && (
              <p className="mt-1 text-xs text-muted-foreground">
                Template : {doc.template_name}
              </p>
            )}
          </div>
          {doc.file_format && (
            <Badge variant="secondary">{doc.file_format.toUpperCase()}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Button size="sm" variant="outline" onClick={onDownload}>
          Telecharger
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
  const [builtinTemplates, setBuiltinTemplates] = useState<BuiltinTemplate[]>(
    [],
  );
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
          if (!controller.signal.aborted) {
            setFetchError(
              extractErrorMessage(err, "Impossible de charger les dossiers"),
            );
          }
        }),
      api
        .get<Template[]>(`/organizations/${orgId}/templates`)
        .then((data) => {
          if (!controller.signal.aborted) setTemplates(data);
        })
        .catch(() => {}),
      api
        .get<BuiltinTemplate[]>("/templates/builtin")
        .then((data) => {
          if (!controller.signal.aborted) setBuiltinTemplates(data);
        })
        .catch(() => {}),
    ]).finally(() => {
      if (!controller.signal.aborted) setDocsLoading(false);
    });
    return () => controller.abort();
  }, [orgId]);

  if (orgLoading || docsLoading)
    return <p className="text-muted-foreground">Chargement...</p>;
  if (!orgId)
    return (
      <p className="text-muted-foreground">
        Associez votre compte a une organisation.
      </p>
    );

  const tabs: { key: DocTab; label: string }[] = [
    { key: "dossiers", label: "Dossiers generes" },
    { key: "templates", label: "Templates" },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Dossiers</h1>
      <ErrorAlert error={orgError ?? fetchError} />

      <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "dossiers" && (
        <>
          {docs.length === 0 ? (
            <EmptyState message="Aucun dossier genere par votre organisation." />
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

      {activeTab === "templates" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Uploader un nouveau template
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="rounded-md border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                Les templates personnalises ne sont pas disponibles pendant
                l&apos;alpha. Utilisez les templates Jorg integres ci-dessous.
              </p>
              <div className="space-y-2">
                <Label htmlFor="tmpl-name">Nom du template</Label>
                <Input id="tmpl-name" disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tmpl-file">Fichier Word (.docx)</Label>
                <Input id="tmpl-file" type="file" accept=".docx" disabled />
              </div>
              <Button type="button" disabled>
                Indisponible en alpha
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Templates Jorg integres
            </p>
            {builtinTemplates.length === 0 ? (
              <EmptyState message="Aucun template Jorg disponible." />
            ) : (
              <ul className="space-y-2" role="list">
                {builtinTemplates.map((t) => (
                  <li
                    key={t.key}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                  >
                    <div className="space-y-1">
                      <span className="font-medium">{t.name}</span>
                      <p className="text-xs text-muted-foreground">
                        {t.description}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        download(
                          `/templates/builtin/${t.key}/preview`,
                          `apercu-${t.key}.docx`,
                          `builtin-${t.key}`,
                        )
                      }
                    >
                      Apercu
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {templates.length} template{templates.length !== 1 ? "s" : ""}{" "}
              personnalise{templates.length !== 1 ? "s" : ""}
            </p>
            {templates.length === 0 ? (
              <EmptyState message="Aucun template personnalise." />
            ) : (
              <ul className="space-y-2" role="list">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                  >
                    <div className="space-y-1">
                      <span className="font-medium">{t.name}</span>
                      <p className="text-xs text-muted-foreground">
                        {t.detected_placeholders.length} placeholder(s)
                      </p>
                    </div>
                    <Badge variant={t.is_valid ? "default" : "secondary"}>
                      {t.is_valid ? "Valide" : "Non compatible"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
