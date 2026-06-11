"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Breadcrumb } from "@/components/breadcrumb";
import { SkillChip } from "@/components/ui/SkillChip";
import { api, ApiError } from "@/lib/api";
import { mapBusinessError } from "@/lib/errors";
import { initialsFromParts } from "@/lib/labels";
import { cn } from "@/lib/utils";
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

function shortlistCandidateName(
  shortlist: ShortlistCandidateInfo[],
  candidateId: string,
): string {
  const candidate = shortlist.find((c) => c.user_id === candidateId);
  if (!candidate) return "Candidat";
  return candidate.first_name && candidate.last_name
    ? `${candidate.first_name} ${candidate.last_name}`
    : candidate.email;
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
  const [genResults, setGenResults] = useState<BulkGenerateResult[] | null>(
    null,
  );
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    api
      .get<RecruiterProfile>("/recruiters/me/profile")
      .then(async (p) => {
        setOrgId(p.organization_id);
        if (!p.organization_id) return;
        const [oppData, tmplData] = await Promise.all([
          api.get<OpportunityDetail>(
            `/organizations/${p.organization_id}/opportunities/${oppId}`,
          ),
          api.get<TemplateItem[]>(
            `/organizations/${p.organization_id}/templates`,
          ),
        ]);
        setOpp(oppData);
        setTemplates(tmplData.filter((t) => t.is_valid));
      })
      .catch((err) =>
        setError(
          err instanceof ApiError ? mapBusinessError(err.detail) : "Erreur",
        ),
      )
      .finally(() => setLoading(false));
  }, [oppId]);

  async function handleRemove(candidateId: string) {
    if (!orgId || !opp) return;
    await api.delete(
      `/organizations/${orgId}/opportunities/${opp.id}/candidates/${candidateId}`,
    );
    setOpp((prev) =>
      prev
        ? {
            ...prev,
            shortlist: prev.shortlist.filter((c) => c.user_id !== candidateId),
          }
        : prev,
    );
  }

  async function handleBulkGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !opp || !genTemplateId) return;
    setGenerating(true);
    try {
      const results = await api.post<BulkGenerateResult[]>(
        `/organizations/${orgId}/opportunities/${opp.id}/generate`,
        { template_id: genTemplateId, format: genFormat },
      );
      setGenResults(results);
    } catch (err) {
      setBulkError(
        err instanceof ApiError
          ? mapBusinessError(err.detail)
          : "Erreur lors de la génération",
      );
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
        { status: "closed" },
      );
      setOpp((prev) => (prev ? { ...prev, status: updated.status } : prev));
    } finally {
      setClosing(false);
    }
  }

  if (loading) return <p className="text-ink-3">Chargement…</p>;
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  if (!opp) return null;

  const closed = opp.status !== "open";

  return (
    <div className="flex w-full flex-col">
      <Breadcrumb
        items={[
          { label: "Missions", href: "/recruiter/opportunities" },
          { label: opp.title },
        ]}
      />
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-[18px] pt-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="j-overline">Mission</p>
            <h1 className="mt-2 font-heading text-[27px] font-semibold leading-tight">
              {opp.title}
            </h1>
            {opp.description && (
              <p className="mt-1 max-w-[560px] text-[15px] text-ink-2">
                {opp.description}
              </p>
            )}
            {opp.required_skills.length > 0 && (
              <div className="mt-3">
                <p className="j-overline">Compétences requises</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {opp.required_skills.map((s) => (
                    <SkillChip key={s.skill_ref_id} label={s.name} />
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill tone={closed ? "muted" : "positive"}>
              {closed ? "clôturée" : "ouverte"}
            </StatusPill>
            {!closed && (
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
        </header>

        <section className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="flex items-center gap-2 border-b border-line px-[22px] pb-3.5 pt-4">
            <h2 className="font-heading text-[17px] font-semibold">
              Shortlist
            </h2>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-accent-line bg-accent-soft px-1.5 font-mono text-[11px] font-medium text-primary">
              {opp.shortlist.length}
            </span>
          </div>
          {opp.shortlist.length === 0 ? (
            <p className="px-[22px] py-4 text-sm text-ink-3">
              Aucun candidat. Ajoutez-en depuis la{" "}
              <Link
                href="/recruiter/candidates"
                className="font-medium text-primary hover:underline"
              >
                liste des candidats
              </Link>
              .
            </p>
          ) : (
            opp.shortlist.map((c: ShortlistCandidateInfo) => (
              <div
                key={c.user_id}
                className="flex items-center gap-3 border-b border-line px-[22px] py-3 last:border-b-0"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-accent-line bg-accent-soft font-heading text-[12.5px] font-semibold text-primary">
                  {initialsFromParts(c.first_name, c.last_name, c.email)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {c.first_name && c.last_name
                      ? `${c.first_name} ${c.last_name}`
                      : c.email}
                  </p>
                  {c.title && <p className="text-xs text-ink-3">{c.title}</p>}
                </div>
                {c.match_score !== null && (
                  <span
                    className={cn(
                      "inline-flex h-[22px] items-center rounded-[5px] border px-2 font-mono text-[11px] font-medium",
                      c.match_score >= 70
                        ? "border-accent-line bg-accent-soft text-primary"
                        : "border-line bg-paper-2 text-ink-2",
                    )}
                  >
                    {c.match_score}% compat.
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-ink-2"
                  onClick={() => handleRemove(c.user_id)}
                >
                  Retirer
                </Button>
              </div>
            ))
          )}
        </section>

        {opp.shortlist.length > 0 && templates.length > 0 && (
          <section className="rounded-lg border border-accent-line bg-accent-soft-2 px-[26px] py-[22px]">
            <h2 className="font-heading text-[17px] font-semibold">
              Générer tous les dossiers
            </h2>
            <form
              onSubmit={handleBulkGenerate}
              className="mt-4 max-w-xl space-y-4"
            >
              <div className="space-y-1.5">
                <Label className="text-[13.5px] text-ink-2">
                  Modèle de dossier
                </Label>
                <Select
                  value={genTemplateId}
                  onValueChange={(v) => setGenTemplateId(v ?? "")}
                >
                  <SelectTrigger className="bg-surface">
                    <SelectValue placeholder="Choisir un modèle de dossier..." />
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
              <div className="space-y-1.5">
                <Label className="text-[13.5px] text-ink-2">Format</Label>
                <Select
                  value={genFormat}
                  onValueChange={(v) => setGenFormat(v ?? "docx")}
                >
                  <SelectTrigger className="bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="docx">Word (.docx)</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={generating || !genTemplateId}>
                {generating
                  ? "Génération en cours…"
                  : `Générer pour ${opp.shortlist.length} candidat${opp.shortlist.length > 1 ? "s" : ""}`}
              </Button>
            </form>
            <ErrorAlert error={bulkError} />

            {genResults && (
              <div className="mt-4 space-y-1">
                <p className="text-sm font-medium">Résultats :</p>
                {genResults.map((r) => (
                  <p key={r.candidate_id} className="text-sm">
                    {shortlistCandidateName(opp.shortlist, r.candidate_id)}{" "}
                    <span
                      className={
                        r.status === "ok" ? "text-success" : "text-destructive"
                      }
                    >
                      {r.status === "ok"
                        ? "Dossier généré"
                        : `Échec - ${mapBusinessError(r.error ?? "Erreur")}`}
                    </span>
                  </p>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
