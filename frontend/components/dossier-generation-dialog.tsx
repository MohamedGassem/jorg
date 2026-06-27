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
import { useDownload, useTemplateChoices } from "@/lib/hooks";
import { downloadFilename } from "@/lib/labels";
import {
  MODEL_BADGES,
  parseTemplateChoice,
  templateChoiceBody,
  templateChoiceValue,
  type TemplateChoice,
} from "@/lib/template-choice";
import { cn } from "@/lib/utils";
import type { GeneratedDocument } from "@/types/api";

/** La cible détermine l'endpoint et les modèles proposés. */
export type GenerationTarget =
  | {
      kind: "recruiter";
      orgId: string;
      candidateId: string;
      candidateName: string;
    }
  | { kind: "self" };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: GenerationTarget;
}

interface GenerationOutcome {
  choiceValue: string;
  format: "docx" | "pdf";
  doc: GeneratedDocument | null;
  error: string | null;
}

export function DossierGenerationDialog({ open, onOpenChange, target }: Props) {
  const [choice, setChoice] = useState<TemplateChoice | null>(null);
  const [format, setFormat] = useState<"docx" | "pdf">("docx");
  const [generating, setGenerating] = useState(false);
  const [outcome, setOutcome] = useState<GenerationOutcome | null>(null);
  const { download, errors: downloadErrors } = useDownload();

  const orgId = target.kind === "recruiter" ? target.orgId : null;
  const { builtinTemplates, orgTemplates, loading, loaded, loadError } =
    useTemplateChoices(open, orgId);

  const choiceValue = choice ? templateChoiceValue(choice) : "";
  // Le résultat (ou l'erreur) n'est affiché que s'il correspond à la sélection
  // courante : changer de modèle ou de format l'écarte automatiquement.
  const current =
    outcome && outcome.choiceValue === choiceValue && outcome.format === format
      ? outcome
      : null;
  const result = current?.doc ?? null;
  const error = loadError ?? current?.error ?? null;

  const selectedTemplateName = choice
    ? choice.source === "jorg"
      ? builtinTemplates.find((t) => t.key === choice.key)?.name
      : orgTemplates.find((t) => t.id === choice.id)?.name
    : undefined;

  const hasTemplates = builtinTemplates.length > 0 || orgTemplates.length > 0;

  async function handleGenerate() {
    if (!choice) return;
    setGenerating(true);
    setOutcome(null);
    try {
      const doc =
        target.kind === "recruiter"
          ? await api.post<GeneratedDocument>(
              `/organizations/${target.orgId}/generate`,
              {
                candidate_id: target.candidateId,
                ...templateChoiceBody(choice),
                format,
              },
            )
          : await api.post<GeneratedDocument>("/candidates/me/generate", {
              ...templateChoiceBody(choice),
              format,
            });
      setOutcome({ choiceValue, format, doc, error: null });
    } catch (err) {
      setOutcome({
        choiceValue,
        format,
        doc: null,
        error: extractErrorMessage(err, "Erreur de génération"),
      });
    } finally {
      setGenerating(false);
    }
  }

  function handleClose() {
    setChoice(null);
    setFormat("docx");
    setOutcome(null);
    onOpenChange(false);
  }

  function selectValue(value: string) {
    setChoice(parseTemplateChoice(value));
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {target.kind === "recruiter"
              ? `Générer un dossier candidat - ${target.candidateName}`
              : "Générer mon dossier Jorg"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : !hasTemplates && loaded ? (
          <p className="text-sm text-muted-foreground">
            Aucun modèle de dossier disponible pour le moment.
          </p>
        ) : (
          <div className="space-y-5">
            <section className="space-y-3">
              <div>
                <p className="text-sm font-medium">Modèle de dossier</p>
                <p className="text-sm text-muted-foreground">
                  {target.kind === "recruiter"
                    ? "Sélectionnez le modèle qui correspond au niveau de détail attendu par le client."
                    : "Choisissez le format de présentation adapté à votre dossier."}
                </p>
              </div>

              {builtinTemplates.length > 0 && (
                <div className="space-y-2">
                  {target.kind === "recruiter" && (
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Modèles Jorg
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {builtinTemplates.map((template) => {
                      const value = templateChoiceValue({
                        source: "jorg",
                        key: template.key,
                      });
                      const selected = choiceValue === value;
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
                            data-testid="template-card"
                            onClick={() => selectValue(value)}
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
                                downloadFilename(
                                  ["apercu", template.name],
                                  "docx",
                                ),
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

              {target.kind === "recruiter" && orgTemplates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Modèles organisation
                  </p>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {orgTemplates.map((template) => {
                      const value = templateChoiceValue({
                        source: "org",
                        id: template.id,
                      });
                      const selected = choiceValue === value;
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => selectValue(value)}
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
                      downloadFilename(
                        target.kind === "recruiter"
                          ? [
                              "dossier",
                              target.candidateName,
                              selectedTemplateName,
                            ]
                          : ["mon dossier", selectedTemplateName],
                        result.file_format,
                      ),
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
              <Button onClick={handleGenerate} disabled={generating || !choice}>
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
