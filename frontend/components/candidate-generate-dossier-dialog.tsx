"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useDownload } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type { BuiltinTemplate, GeneratedDocument } from "@/types/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MODEL_BADGES: Record<string, string> = {
  compact_esn: "Compact",
  dossier_technique: "Technique",
  profil_premium: "Complet",
};

interface GenerationOutcome {
  templateKey: string;
  format: "docx" | "pdf";
  doc: GeneratedDocument | null;
  error: string | null;
}

export function CandidateGenerateDossierDialog({ open, onOpenChange }: Props) {
  const [templates, setTemplates] = useState<BuiltinTemplate[]>([]);
  const [templateKey, setTemplateKey] = useState("");
  const [format, setFormat] = useState<"docx" | "pdf">("docx");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [outcome, setOutcome] = useState<GenerationOutcome | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { download, errors: downloadErrors } = useDownload();

  useEffect(() => {
    if (!open || templates.length > 0) return;
    setLoading(true);
    api
      .get<BuiltinTemplate[]>("/templates/builtin")
      .then(setTemplates)
      .catch((err) =>
        setLoadError(
          extractErrorMessage(
            err,
            "Impossible de charger les modèles de dossier",
          ),
        ),
      )
      .finally(() => setLoading(false));
  }, [open, templates.length]);

  // Le résultat (ou l'erreur) n'est affiché que s'il correspond à la sélection
  // courante : changer de modèle ou de format l'écarte automatiquement.
  const current =
    outcome && outcome.templateKey === templateKey && outcome.format === format
      ? outcome
      : null;
  const result = current?.doc ?? null;
  const error = loadError ?? current?.error ?? null;

  async function handleGenerate() {
    if (!templateKey) return;
    setGenerating(true);
    setOutcome(null);
    try {
      const doc = await api.post<GeneratedDocument>("/candidates/me/generate", {
        system_template_key: templateKey,
        format,
      });
      setOutcome({ templateKey, format, doc, error: null });
    } catch (err) {
      setOutcome({
        templateKey,
        format,
        doc: null,
        error: extractErrorMessage(err, "Erreur de génération"),
      });
    } finally {
      setGenerating(false);
    }
  }

  function handleClose() {
    setTemplateKey("");
    setFormat("docx");
    setOutcome(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Générer mon dossier Jorg</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : (
          <div className="space-y-5">
            <section className="space-y-3">
              <div>
                <p className="text-sm font-medium">Modèle de dossier</p>
                <p className="text-sm text-muted-foreground">
                  Choisissez le format de présentation adapté à votre dossier.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {templates.map((template) => {
                  const selected = template.key === templateKey;
                  return (
                    <div
                      key={template.key}
                      className={cn(
                        "rounded-lg border bg-surface p-3 transition-colors",
                        selected
                          ? "border-primary ring-2 ring-primary/20"
                          : "border-border",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setTemplateKey(template.key)}
                        className="w-full text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">
                            {template.name}
                          </p>
                          <Badge variant="primary-soft">
                            {MODEL_BADGES[template.key] ?? "Jorg"}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {template.description}
                        </p>
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() =>
                          download(
                            `/templates/builtin/${template.key}/preview`,
                            `apercu-${template.key}.docx`,
                            `candidate-preview-${template.key}`,
                          )
                        }
                      >
                        Aperçu
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-sm font-medium">Format de sortie</p>
              <div className="flex gap-2">
                {(["docx", "pdf"] as const).map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={format === option ? "default" : "outline"}
                    onClick={() => setFormat(option)}
                  >
                    {option === "docx" ? "Word (.docx)" : "PDF"}
                  </Button>
                ))}
              </div>
            </section>

            <ErrorAlert error={error} />

            {result ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-sm font-medium text-success">
                  Dossier généré avec succès.
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    download(
                      `/documents/${result.id}/download`,
                      `mon-dossier.${result.file_format}`,
                      result.id,
                    )
                  }
                >
                  Télécharger ({result.file_format.toUpperCase()})
                </Button>
                {format === "pdf" && result.file_format === "docx" && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    La conversion PDF est momentanément indisponible : le
                    dossier a été généré au format Word.
                  </p>
                )}
                <ErrorAlert error={downloadErrors[result.id] ?? null} />
              </div>
            ) : (
              <Button
                onClick={handleGenerate}
                disabled={generating || !templateKey}
              >
                {generating
                  ? "Génération..."
                  : `Générer mon dossier ${format.toUpperCase()}`}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
