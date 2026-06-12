"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useDownload } from "@/lib/hooks";
import { downloadFilename } from "@/lib/labels";
import type { Template } from "@/types/api";

export function OrgTemplatesSection({ orgId }: { orgId: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { download, errors: downloadErrors } = useDownload();

  const refresh = useCallback(() => {
    api
      .get<Template[]>(`/organizations/${orgId}/templates`)
      .then(setTemplates)
      .catch((err) =>
        setError(extractErrorMessage(err, "Impossible de charger les modèles")),
      );
  }, [orgId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !name.trim()) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("file", file);
      await api.upload<Template>(`/organizations/${orgId}/templates`, formData);
      setName("");
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } catch (err) {
      setError(extractErrorMessage(err, "Échec de l'import du modèle"));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(template: Template) {
    if (!window.confirm(`Supprimer le modèle « ${template.name} » ?`)) return;
    try {
      await api.delete(`/organizations/${orgId}/templates/${template.id}`);
      refresh();
    } catch (err) {
      setError(extractErrorMessage(err, "Échec de la suppression"));
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-heading text-base font-semibold">
            Modèles personnalisés
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Importez votre modèle Word avec les balises Jorg. La validation se
            fait par un rendu d&apos;essai sur un candidat fictif.
          </p>
        </div>
        <Badge variant="primary-soft">Disponible</Badge>
      </div>

      <ErrorAlert error={error} />

      <form
        onSubmit={handleUpload}
        className="mt-4 flex flex-col gap-3 rounded-lg border border-dashed border-border p-4 md:flex-row md:items-end"
      >
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Nom du modèle
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            className="rounded-md border border-border bg-background px-3 py-2"
            placeholder="Dossier client standard"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Fichier .docx (10 Mo max)
          <input
            ref={fileRef}
            type="file"
            accept=".docx"
            required
            className="text-sm"
          />
        </label>
        <Button type="submit" disabled={uploading}>
          <Upload className="size-4" strokeWidth={1.6} />
          {uploading ? "Import..." : "Importer"}
        </Button>
      </form>

      <div className="mt-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Créer votre modèle</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>
            Téléchargez le{" "}
            <button
              type="button"
              className="underline"
              onClick={() =>
                download(
                  "/templates/sample",
                  "jorg-sample-template.docx",
                  "sample",
                )
              }
            >
              modèle d&apos;exemple
            </button>{" "}
            pour voir les balises disponibles ({"{{first_name}}"}, {"{{title}}"}
            , boucles expériences, formations...).
          </li>
          <li>Insérez les balises dans votre propre document Word.</li>
          <li>
            Importez-le ci-dessus, puis vérifiez l&apos;aperçu généré sur un
            candidat fictif avant de l&apos;utiliser.
          </li>
        </ol>
        {downloadErrors["sample"] && (
          <p className="mt-1 text-xs text-danger">{downloadErrors["sample"]}</p>
        )}
      </div>

      {templates.length > 0 && (
        <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {templates.map((template) => (
            <li
              key={template.id}
              className="rounded-lg border border-border bg-background p-3 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{template.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {template.detected_placeholders.length} champ
                    {template.detected_placeholders.length > 1 ? "s" : ""}{" "}
                    détecté
                    {template.detected_placeholders.length > 1 ? "s" : ""}
                  </p>
                </div>
                <Badge variant={template.is_valid ? "success" : "warning"}>
                  {template.is_valid ? "Valide" : "Invalide"}
                </Badge>
              </div>
              {template.validation_error && (
                <p className="mt-2 text-xs text-danger">
                  {template.validation_error}
                </p>
              )}
              {template.unknown_placeholders.length > 0 && (
                <p className="mt-2 text-xs text-warning">
                  Balises non reconnues (rendues vides) :{" "}
                  {template.unknown_placeholders.join(", ")}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    download(
                      `/organizations/${orgId}/templates/${template.id}/preview`,
                      downloadFilename(["apercu", template.name], "docx"),
                      `preview-${template.id}`,
                    )
                  }
                >
                  <Eye className="size-3.5" strokeWidth={1.6} />
                  Aperçu
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    download(
                      `/organizations/${orgId}/templates/${template.id}/file`,
                      downloadFilename([template.name], "docx"),
                      `file-${template.id}`,
                    )
                  }
                >
                  <Download className="size-3.5" strokeWidth={1.6} />
                  Fichier
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(template)}
                >
                  <Trash2 className="size-3.5" strokeWidth={1.6} />
                  Supprimer
                </Button>
              </div>
              {(downloadErrors[`preview-${template.id}`] ??
                downloadErrors[`file-${template.id}`]) && (
                <p className="mt-1 text-xs text-danger">
                  {downloadErrors[`preview-${template.id}`] ??
                    downloadErrors[`file-${template.id}`]}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
