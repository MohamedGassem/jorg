"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useDownload } from "@/lib/hooks";
import type { GeneratedDocument, Template } from "@/types/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  candidateId: string;
  candidateName: string;
  templates: Template[];
}

export function GenerateDossierDialog({
  open,
  onOpenChange,
  orgId,
  candidateId,
  candidateName,
  templates,
}: Props) {
  const [templateId, setTemplateId] = useState("");
  const [format, setFormat] = useState<"docx" | "pdf">("docx");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { download, errors: downloadErrors } = useDownload();

  const validTemplates = templates.filter((t) => t.is_valid);

  async function handleGenerate() {
    if (!templateId) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const doc = await api.post<GeneratedDocument>(
        `/organizations/${orgId}/generate`,
        { candidate_id: candidateId, template_id: templateId, format },
      );
      setResult(doc);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur de génération"));
    } finally {
      setGenerating(false);
    }
  }

  function handleClose() {
    setTemplateId("");
    setFormat("docx");
    setResult(null);
    setError(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Générer un dossier — {candidateName}</DialogTitle>
        </DialogHeader>

        {validTemplates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun template valide. Ajoutez un template compatible dans{" "}
            <a href="/recruiter/documents" className="underline">
              Dossiers → Templates
            </a>
            .
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <Select
                value={templateId}
                onValueChange={(v) => v && setTemplateId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un template…" />
                </SelectTrigger>
                <SelectContent>
                  {validTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Format</Label>
              <Select
                value={format}
                onValueChange={(v) => v && setFormat(v as "docx" | "pdf")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="docx">Word (.docx)</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ErrorAlert error={error} />

            {result ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-emerald-600">
                  Dossier généré avec succès !
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
                <ErrorAlert error={downloadErrors[result.id] ?? null} />
              </div>
            ) : (
              <Button
                onClick={handleGenerate}
                disabled={generating || !templateId}
              >
                {generating ? "Génération…" : "Générer le dossier"}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
