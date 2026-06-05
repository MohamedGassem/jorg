"use client";

import { useEffect, useState } from "react";
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
import type { BuiltinTemplate, GeneratedDocument } from "@/types/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CandidateGenerateDossierDialog({ open, onOpenChange }: Props) {
  const [templates, setTemplates] = useState<BuiltinTemplate[]>([]);
  const [templateKey, setTemplateKey] = useState("");
  const [format, setFormat] = useState<"docx" | "pdf">("docx");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { download, errors: downloadErrors } = useDownload();

  useEffect(() => {
    if (!open || templates.length > 0) return;
    setLoading(true);
    api
      .get<BuiltinTemplate[]>("/templates/builtin")
      .then(setTemplates)
      .catch((err) =>
        setError(
          extractErrorMessage(err, "Impossible de charger les templates"),
        ),
      )
      .finally(() => setLoading(false));
  }, [open, templates.length]);

  const selected = templates.find((t) => t.key === templateKey) ?? null;

  async function handleGenerate() {
    if (!templateKey) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const doc = await api.post<GeneratedDocument>("/candidates/me/generate", {
        system_template_key: templateKey,
        format,
      });
      setResult(doc);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur de generation"));
    } finally {
      setGenerating(false);
    }
  }

  function handleClose() {
    setTemplateKey("");
    setFormat("docx");
    setResult(null);
    setError(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generer mon dossier</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <Select
                value={templateKey}
                onValueChange={(v) => v && setTemplateKey(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    {selected.description}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      download(
                        `/templates/builtin/${selected.key}/preview`,
                        `apercu-${selected.key}.docx`,
                        `candidate-preview-${selected.key}`,
                      )
                    }
                  >
                    Apercu
                  </Button>
                </div>
              )}
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
                  Dossier genere avec succes.
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
                  Telecharger ({result.file_format.toUpperCase()})
                </Button>
                <ErrorAlert error={downloadErrors[result.id] ?? null} />
              </div>
            ) : (
              <Button
                onClick={handleGenerate}
                disabled={generating || !templateKey}
              >
                {generating ? "Generation..." : "Generer mon dossier"}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
