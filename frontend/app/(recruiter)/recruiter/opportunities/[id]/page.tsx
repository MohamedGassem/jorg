"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
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
import type {
  BulkGenerateResult,
  OpportunityDetail,
  RecruiterProfile,
  ShortlistCandidateInfo,
} from "@/types/api";

interface TemplateItem {
  id: string;
  name: string;
  is_valid: boolean;
}

export default function OpportunityDetailPage() {
  const { id: oppId } = useParams<{ id: string }>();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [opp, setOpp] = useState<OpportunityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [genTemplateId, setGenTemplateId] = useState("");
  const [genFormat, setGenFormat] = useState("docx");
  const [generating, setGenerating] = useState(false);
  const [genResults, setGenResults] = useState<BulkGenerateResult[] | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    api
      .get<RecruiterProfile>("/recruiters/me/profile")
      .then(async (p) => {
        setOrgId(p.organization_id);
        if (!p.organization_id) return;
        const [oppData, tmplData] = await Promise.all([
          api.get<OpportunityDetail>(
            `/organizations/${p.organization_id}/opportunities/${oppId}`
          ),
          api.get<TemplateItem[]>(
            `/organizations/${p.organization_id}/templates`
          ),
        ]);
        setOpp(oppData);
        setTemplates(tmplData.filter((t) => t.is_valid));
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.detail : "Erreur")
      )
      .finally(() => setLoading(false));
  }, [oppId]);

  async function handleRemove(candidateId: string) {
    if (!orgId || !opp) return;
    await api.delete(
      `/organizations/${orgId}/opportunities/${opp.id}/candidates/${candidateId}`
    );
    setOpp((prev) =>
      prev
        ? {
            ...prev,
            shortlist: prev.shortlist.filter((c) => c.user_id !== candidateId),
          }
        : prev
    );
  }

  async function handleBulkGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !opp || !genTemplateId) return;
    setGenerating(true);
    try {
      const results = await api.post<BulkGenerateResult[]>(
        `/organizations/${orgId}/opportunities/${opp.id}/generate`,
        { template_id: genTemplateId, format: genFormat }
      );
      setGenResults(results);
    } catch (err) {
      alert(err instanceof ApiError ? err.detail : "Erreur");
    } finally {
      setGenerating(false);
    }
  }

  async function handleClose() {
    if (!orgId || !opp) return;
    setClosing(true);
    try {
      const updated = await api.patch<OpportunityDetail>(
        `/organizations/${orgId}/opportunities/${opp.id}`,
        { status: "closed" }
      );
      setOpp((prev) => (prev ? { ...prev, status: updated.status } : prev));
    } finally {
      setClosing(false);
    }
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  if (!opp) return null;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{opp.title}</h1>
          {opp.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {opp.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={opp.status === "open" ? "default" : "secondary"}>
            {opp.status === "open" ? "Ouverte" : "Clôturée"}
          </Badge>
          {opp.status === "open" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={closing}
            >
              {closing ? "…" : "Clôturer"}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Shortlist ({opp.shortlist.length} candidat
            {opp.shortlist.length !== 1 ? "s" : ""})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {opp.shortlist.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun candidat. Ajoutez-en depuis la{" "}
              <a href="/recruiter/candidates" className="underline">
                liste des candidats
              </a>
              .
            </p>
          ) : (
            <ul className="space-y-2">
              {opp.shortlist.map((c: ShortlistCandidateInfo) => (
                <li
                  key={c.user_id}
                  className="flex items-center justify-between gap-2 rounded border p-2 text-sm"
                >
                  <span>
                    {c.first_name && c.last_name
                      ? `${c.first_name} ${c.last_name}`
                      : c.email}
                    {c.title && (
                      <span className="ml-2 text-muted-foreground">
                        — {c.title}
                      </span>
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(c.user_id)}
                  >
                    Retirer
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {opp.shortlist.length > 0 && templates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Générer tous les dossiers</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleBulkGenerate} className="space-y-4">
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={genTemplateId} onValueChange={(v) => setGenTemplateId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un template…" />
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
                <Label>Format</Label>
                <Select value={genFormat} onValueChange={(v) => setGenFormat(v ?? "docx")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="docx">Word (.docx)</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                disabled={generating || !genTemplateId}
              >
                {generating
                  ? "Génération en cours…"
                  : `Générer pour ${opp.shortlist.length} candidat${opp.shortlist.length > 1 ? "s" : ""}`}
              </Button>
            </form>

            {genResults && (
              <div className="mt-4 space-y-1">
                <p className="text-sm font-medium">Résultats :</p>
                {genResults.map((r) => (
                  <p key={r.candidate_id} className="text-sm">
                    {r.candidate_id.slice(0, 8)}…{" "}
                    <span
                      className={
                        r.status === "ok"
                          ? "text-green-600"
                          : "text-destructive"
                      }
                    >
                      {r.status === "ok" ? "✓ Généré" : `✗ ${r.error}`}
                    </span>
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
