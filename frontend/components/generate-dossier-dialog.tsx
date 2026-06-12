"use client";

import { useState } from "react";
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
import type { BuiltinTemplate, GeneratedDocument, Template } from "@/types/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  candidateId: string;
  candidateName: string;
  templates: Template[];
  builtinTemplates: BuiltinTemplate[];
}

const MODEL_BADGES: Record<string, string> = {
  compact_esn: "Compact",
  dossier_technique: "Technique",
  profil_premium: "Complet",
};

interface GenerationOutcome {
  templateChoice: string;
  format: "docx" | "pdf";
  doc: GeneratedDocument | null;
  error: string | null;
}

export function GenerateDossierDialog({
  open,
  onOpenChange,
  orgId,
  candidateId,
  candidateName,
  templates,
  builtinTemplates,
}: Props) {
  const [templateChoice, setTemplateChoice] = useState("");
  const [format, setFormat] = useState<"docx" | "pdf">("docx");
  const [generating, setGenerating] = useState(false);
  const [outcome, setOutcome] = useState<GenerationOutcome | null>(null);
  const { download, errors: downloadErrors } = useDownload();

  const validTemplates = templates.filter((t) => t.is_valid);
  const hasTemplates = builtinTemplates.length > 0 || validTemplates.length > 0;

  // Le résultat (ou l'erreur) n'est affiché que s'il correspond à la sélection
  // courante : changer de modèle ou de format l'écarte automatiquement.
  const current =
    outcome &&
    outcome.templateChoice === templateChoice &&
    outcome.format === format
      ? outcome
      : null;
  const result = current?.doc ?? null;
  const error = current?.error ?? null;

  async function handleGenerate() {
    if (!templateChoice) return;
    setGenerating(true);
    setOutcome(null);
    try {
      const body = templateChoice.startsWith("system:")
        ? {
            candidate_id: candidateId,
            system_template_key: templateChoice.slice("system:".length),
            format,
          }
        : {
            candidate_id: candidateId,
            template_id: templateChoice.slice("org:".length),
            format,
          };
      const doc = await api.post<GeneratedDocument>(
        `/organizations/${orgId}/generate`,
        body,
      );
      setOutcome({ templateChoice, format, doc, error: null });
    } catch (err) {
      setOutcome({
        templateChoice,
        format,
        doc: null,
        error: extractErrorMessage(err, "Erreur de génération"),
      });
    } finally {
      setGenerating(false);
    }
  }

  function handleClose() {
    setTemplateChoice("");
    setFormat("docx");
    setOutcome(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Générer un dossier candidat - {candidateName}
          </DialogTitle>
        </DialogHeader>

        {!hasTemplates ? (
          <p className="text-sm text-muted-foreground">
            Aucun modèle de dossier disponible pour le moment.
          </p>
        ) : (
          <div className="space-y-5">
            <section className="space-y-3">
              <div>
                <p className="text-sm font-medium">Modèle de dossier</p>
                <p className="text-sm text-muted-foreground">
                  Sélectionnez le modèle qui correspond au niveau de détail
                  attendu par le client.
                </p>
              </div>

              {builtinTemplates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Modèles Jorg
                  </p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {builtinTemplates.map((template) => {
                      const value = `system:${template.key}`;
                      const selected = templateChoice === value;
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
                            onClick={() => setTemplateChoice(value)}
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
                                `preview-${template.key}`,
                              )
                            }
                          >
                            Aperçu
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {validTemplates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Modèles organisation
                  </p>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {validTemplates.map((template) => {
                      const value = `org:${template.id}`;
                      const selected = templateChoice === value;
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => setTemplateChoice(value)}
                          className={cn(
                            "rounded-lg border bg-surface p-3 text-left transition-colors",
                            selected
                              ? "border-primary ring-2 ring-primary/20"
                              : "border-border",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold">
                              {template.name}
                            </p>
                            <Badge variant="secondary">Organisation</Badge>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {template.description ??
                              "Modèle valide fourni par votre organisation."}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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
                      `dossier.${result.file_format}`,
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
                disabled={generating || !templateChoice}
              >
                {generating
                  ? "Génération..."
                  : `Générer le dossier ${format.toUpperCase()}`}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
