// frontend/app/(recruiter)/generate/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import type { GeneratedDocument, RecruiterProfile, Template } from "@/types/api";

export default function GeneratePage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [format, setFormat] = useState<"docx" | "pdf">("docx");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<RecruiterProfile>("/recruiters/me/profile").then((p) => {
      setOrgId(p.organization_id);
      if (p.organization_id) {
        return api.get<Template[]>(`/organizations/${p.organization_id}/templates`)
          .then((t) => setTemplates(t.filter((tmpl) => tmpl.is_valid)));
      }
    }).catch(console.error);
  }, []);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !templateId || !candidateId.trim()) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const doc = await api.post<GeneratedDocument>(`/organizations/${orgId}/generate`, {
        candidate_id: candidateId.trim(),
        template_id: templateId,
        format,
      });
      setResult(doc);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Erreur de génération");
    } finally {
      setGenerating(false);
    }
  }

  if (!orgId) return <p className="text-muted-foreground">Associez votre compte à une organisation.</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Générer un dossier</h1>
      <Card>
        <CardHeader><CardTitle>Paramètres de génération</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="candidateId">ID du candidat</Label>
              <input
                id="candidateId"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="UUID du candidat"
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template">Template</Label>
              <Select value={templateId} onValueChange={(v) => v && setTemplateId(v)}>
                <SelectTrigger id="template">
                  <SelectValue placeholder="Choisir un template valide…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="format">Format</Label>
              <Select value={format} onValueChange={(v) => v && setFormat(v as "docx" | "pdf")}>
                <SelectTrigger id="format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="docx">Word (.docx)</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={generating || !templateId}>
              {generating ? "Génération…" : "Générer le dossier"}
            </Button>
          </form>
        </CardContent>
      </Card>
      {result && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-4 text-sm text-green-600 font-medium">Dossier généré avec succès !</p>
            <Button asChild variant="outline">
              <a href={api.downloadUrl(`/documents/${result.id}/download`)} download>
                Télécharger ({result.file_format.toUpperCase()})
              </a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
