"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, FolderOpen, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { TabBar } from "@/components/ui/TabBar";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useDownload, useRecruiterOrg } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type {
  BuiltinTemplate,
  GeneratedDocumentRecruiterView,
  Template,
} from "@/types/api";

type DocTab = "dossiers" | "templates";

const MODEL_META: Record<
  string,
  { recommendedFor: string; value: string; badge: string }
> = {
  compact_esn: {
    recommendedFor: "Premier envoi client",
    value: "Format court pour qualifier rapidement un profil.",
    badge: "Compact",
  },
  dossier_technique: {
    recommendedFor: "Validation technique",
    value: "Met en avant missions, compétences et environnement technique.",
    badge: "Détaillé",
  },
  profil_premium: {
    recommendedFor: "Profil senior ou rare",
    value: "Présentation plus soignée pour valoriser un profil clé.",
    badge: "Complet",
  },
};

function DocumentModelCard({
  template,
  onPreview,
}: {
  template: BuiltinTemplate;
  onPreview: () => void;
}) {
  const meta = MODEL_META[template.key] ?? {
    recommendedFor: "Génération de dossier",
    value: template.description,
    badge: "Jorg",
  };

  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-base font-semibold">
              {template.name}
            </h3>
            <Badge variant="primary-soft">{meta.badge}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {template.description}
          </p>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Usage recommandé
          </dt>
          <dd className="mt-1 text-foreground">{meta.recommendedFor}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Apport dossier
          </dt>
          <dd className="mt-1 text-foreground">{meta.value}</dd>
        </div>
      </dl>
      <div className="mt-4">
        <Button type="button" size="sm" variant="outline" onClick={onPreview}>
          Aperçu du modèle
        </Button>
      </div>
    </li>
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
        Associez votre compte à une organisation.
      </p>
    );

  const tabs: { key: DocTab; label: string; count?: number }[] = [
    { key: "dossiers", label: "Dossiers générés", count: docs.length },
    { key: "templates", label: "Modèles de dossier" },
  ];

  return (
    <div className="flex w-full flex-col gap-[18px]">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="j-overline">
            {docs.length} dossier{docs.length > 1 ? "s" : ""} généré
            {docs.length > 1 ? "s" : ""}
          </p>
          <h1 className="mt-2 font-heading text-[27px] font-semibold leading-tight">
            Dossiers générés
          </h1>
          <p className="mt-1 max-w-[560px] text-[15px] text-ink-2">
            Les dossiers composés à partir des données candidats. Chacun reste
            lié à sa source.
          </p>
        </div>
        <Link
          href="/recruiter/candidates"
          className={cn(buttonVariants({ variant: "default" }), "w-fit")}
        >
          <Plus className="size-4" strokeWidth={1.6} />
          Générer un dossier
        </Link>
      </header>
      <ErrorAlert error={orgError ?? fetchError} />

      <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "dossiers" && (
        <section>
          {docs.length === 0 ? (
            <EmptyState
              message="Aucun dossier généré pour le moment."
              description="Les dossiers créés depuis les candidats autorisés apparaîtront ici avec le modèle utilisé et le format de fichier."
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("templates")}
                >
                  Voir les modèles disponibles
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Dossier", "Candidat", "Généré le", "Format", ""].map(
                      (label, i) => (
                        <th
                          key={i}
                          className="border-b border-line px-4 pb-3 pt-4 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-4"
                        >
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => {
                    const candidateName =
                      [doc.candidate_first_name, doc.candidate_last_name]
                        .filter(Boolean)
                        .join(" ") || "Candidat inconnu";
                    const candidateInitials =
                      [
                        doc.candidate_first_name?.[0],
                        doc.candidate_last_name?.[0],
                      ]
                        .filter(Boolean)
                        .join("")
                        .toUpperCase() || "?";
                    return (
                      <tr
                        key={doc.id}
                        className="border-b border-line last:border-b-0 hover:bg-paper-2"
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-[11px]">
                            <span className="grid size-[30px] shrink-0 place-items-center rounded-[7px] border border-line bg-paper-2 text-ink-3">
                              <FolderOpen
                                className="size-[15px]"
                                strokeWidth={1.6}
                              />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                {doc.opportunity_title ??
                                  doc.template_name ??
                                  "Dossier"}
                              </p>
                              {doc.opportunity_title && doc.template_name && (
                                <p className="text-xs text-ink-3">
                                  {doc.template_name}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="grid size-[26px] place-items-center rounded-md border border-accent-line bg-accent-soft font-heading text-[11px] font-semibold text-primary">
                              {candidateInitials}
                            </span>
                            <span className="text-[13.5px]">
                              {candidateName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="j-meta whitespace-nowrap text-[12.5px]">
                            {new Date(doc.generated_at).toLocaleString(
                              "fr-FR",
                              {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="j-meta text-[12.5px] uppercase">
                            {doc.file_format}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              download(
                                `/documents/${doc.id}/download`,
                                `dossier.${doc.file_format}`,
                                doc.id,
                              )
                            }
                          >
                            <Download className="size-3.5" strokeWidth={1.6} />
                            Télécharger
                          </Button>
                          {downloadErrors[doc.id] && (
                            <p className="mt-1 text-xs text-danger">
                              {downloadErrors[doc.id]}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === "templates" && (
        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-surface p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="font-heading text-base font-semibold">
                  Modèles Jorg intégrés
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Trois formats prêts pour l&apos;alpha : compact, technique et
                  complet.
                </p>
              </div>
              <Badge variant="primary-soft">Disponible alpha</Badge>
            </div>

            {builtinTemplates.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  message="Aucun modèle Jorg disponible."
                  description="Les modèles intégrés seront affichés ici dès qu'ils seront chargés."
                />
              </div>
            ) : (
              <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                {builtinTemplates.map((template) => (
                  <DocumentModelCard
                    key={template.key}
                    template={template}
                    onPreview={() =>
                      download(
                        `/templates/builtin/${template.key}/preview`,
                        `apercu-${template.key}.docx`,
                        `builtin-${template.key}`,
                      )
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-dashed border-border bg-muted/20 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="font-heading text-base font-semibold">
                  Modèles personnalisés
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  L&apos;import de modèles personnalisés est volontairement
                  fermé pendant l&apos;alpha pour garantir la qualité des
                  dossiers générés.
                </p>
              </div>
              <Badge variant="warning">Post-alpha</Badge>
            </div>

            {templates.length > 0 && (
              <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
                {templates.map((template) => (
                  <li
                    key={template.id}
                    className="rounded-lg border border-border bg-background p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{template.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {template.detected_placeholders.length} champ
                          {template.detected_placeholders.length > 1
                            ? "s"
                            : ""}{" "}
                          détecté
                          {template.detected_placeholders.length > 1 ? "s" : ""}
                        </p>
                      </div>
                      <Badge
                        variant={template.is_valid ? "success" : "warning"}
                      >
                        {template.is_valid ? "Valide" : "À vérifier"}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
