// frontend/app/(recruiter)/generate/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Input } from "@/components/ui/input";
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
import { useDownload, useRecruiterOrg } from "@/lib/hooks";
import type {
  AccessibleCandidate,
  GeneratedDocument,
  Template,
} from "@/types/api";

function candidateLabel(c: AccessibleCandidate): string {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return full ? `${full} (${c.email})` : c.email;
}

export default function GeneratePage() {
  const { orgId, loading: orgLoading } = useRecruiterOrg();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [candidates, setCandidates] = useState<AccessibleCandidate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [format, setFormat] = useState<"docx" | "pdf">("docx");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { download, errors: downloadErrors } = useDownload();

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const [tmpls, cands] = await Promise.all([
          api.get<Template[]>(`/organizations/${orgId}/templates`),
          api.get<AccessibleCandidate[]>(`/organizations/${orgId}/candidates`),
        ]);
        if (cancelled) return;
        setTemplates(tmpls.filter((t) => t.is_valid));
        setCandidates(cands);
      } catch (err) {
        if (!cancelled)
          setError(extractErrorMessage(err, "Erreur de chargement"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const selectedCandidate = useMemo(
    () => candidates.find((c) => c.user_id === candidateId) ?? null,
    [candidates, candidateId],
  );

  const filteredCandidates = useMemo(() => {
    const q = candidateQuery.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      candidateLabel(c).toLowerCase().includes(q),
    );
  }, [candidates, candidateQuery]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !templateId || !candidateId) return;
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

  if (orgLoading) return <p className="text-muted-foreground">Chargement…</p>;

  if (!orgId)
    return (
      <p className="text-muted-foreground">
        Associez votre compte à une organisation.
      </p>
    );

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Générer un dossier</h1>
      <Card>
        <CardHeader>
          <CardTitle>Paramètres de génération</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="candidate-search">Candidat</Label>
              <Input
                id="candidate-search"
                placeholder="Rechercher par nom ou email…"
                value={
                  selectedCandidate
                    ? candidateLabel(selectedCandidate)
                    : candidateQuery
                }
                onChange={(e) => {
                  setCandidateId("");
                  setCandidateQuery(e.target.value);
                }}
                aria-autocomplete="list"
                aria-expanded={
                  !selectedCandidate && filteredCandidates.length > 0
                }
              />
              {!selectedCandidate && candidateQuery && (
                <ul
                  role="listbox"
                  className="max-h-48 overflow-y-auto rounded-md border bg-popover p-1 text-sm shadow-md"
                >
                  {filteredCandidates.length === 0 && (
                    <li className="px-2 py-1.5 text-muted-foreground">
                      Aucun candidat ne correspond.
                    </li>
                  )}
                  {filteredCandidates.map((c) => (
                    <li key={c.user_id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        className="flex w-full flex-col rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                        onClick={() => {
                          setCandidateId(c.user_id);
                          setCandidateQuery("");
                        }}
                      >
                        <span className="font-medium">{candidateLabel(c)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selectedCandidate && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => {
                    setCandidateId("");
                    setCandidateQuery("");
                  }}
                >
                  Changer de candidat
                </button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="template">Template</Label>
              <Select
                value={templateId}
                onValueChange={(v) => v && setTemplateId(v)}
              >
                <SelectTrigger id="template">
                  <SelectValue placeholder="Choisir un template valide…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="format">Format</Label>
              <Select
                value={format}
                onValueChange={(v) => v && setFormat(v as "docx" | "pdf")}
              >
                <SelectTrigger id="format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="docx">Word (.docx)</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ErrorAlert error={error} />
            <Button
              type="submit"
              disabled={generating || !templateId || !candidateId}
            >
              {generating ? "Génération…" : "Générer le dossier"}
            </Button>
          </form>
        </CardContent>
      </Card>
      {result && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-4 text-sm text-green-600 font-medium">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
