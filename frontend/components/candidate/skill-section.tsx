// frontend/components/candidate/skill-section.tsx
"use client";

import { useEffect, useState } from "react";
import { Plus, X, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useAsyncOp } from "@/lib/hooks/useAsyncOp";
import { useSearchableSelect } from "@/lib/hooks/useSearchableSelect";
import { SkillContextualizationDialog } from "@/components/candidate/SkillContextualizationDialog";
import type { Experience, Skill, SkillReference, SkillKind } from "@/types/api";

// ---- Types & constants -------------------------------------------------------

const KIND_ORDER: SkillKind[] = [
  "technical",
  "tool",
  "functional",
  "methodology",
  "sectoral",
  "soft",
];

const KIND_LABELS: Record<SkillKind, string> = {
  technical: "Technique",
  tool: "Outil",
  functional: "Fonctionnel",
  methodology: "Méthodologie",
  sectoral: "Sectoriel",
  soft: "Soft skills",
};

type SkillForm = {
  skill_ref_id: string;
  skill_ref_name: string;
  skill_ref_is_custom: boolean;
  self_assessed_level: string;
  featured: boolean;
  notes: string;
  kind: SkillKind | "";
};

const CUSTOM_PENDING = "__custom_pending__";

const EMPTY_SKILL: SkillForm = {
  skill_ref_id: "",
  skill_ref_name: "",
  skill_ref_is_custom: false,
  self_assessed_level: "",
  featured: false,
  notes: "",
  kind: "",
};

const LEVEL_OPTIONS: { value: string; label: string }[] = [
  { value: "1", label: "1/5 - Notions" },
  { value: "2", label: "2/5 - Débutant" },
  { value: "3", label: "3/5 - Intermédiaire" },
  { value: "4", label: "4/5 - Confirmé" },
  { value: "5", label: "5/5 - Expert" },
];

function skillToForm(skill: Skill): SkillForm {
  return {
    skill_ref_id: skill.skill_ref_id,
    skill_ref_name: skill.skill_ref.name,
    skill_ref_is_custom: skill.skill_ref.is_custom,
    self_assessed_level: skill.self_assessed_level ?? "",
    featured: skill.featured,
    notes: skill.notes ?? "",
    kind: skill.skill_ref.kind,
  };
}

// ---- Exported section --------------------------------------------------------

export function SkillSection() {
  const [items, setItems] = useState<Skill[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SkillForm>(EMPTY_SKILL);
  const [contextSkill, setContextSkill] = useState<Skill | null>(null);

  const dialogOp = useAsyncOp("Erreur lors de la sauvegarde");
  const search = useSearchableSelect<SkillReference>((q) =>
    api.get<SkillReference[]>(`/skill-references?q=${encodeURIComponent(q)}`),
  );

  useEffect(() => {
    Promise.all([
      api.get<Skill[]>("/candidates/me/skills"),
      api.get<Experience[]>("/candidates/me/experiences"),
    ])
      .then(([skills, exps]) => {
        setItems(skills);
        setExperiences(exps);
      })
      .catch((err) =>
        setFetchError(
          extractErrorMessage(err, "Impossible de charger les compétences"),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof SkillForm>(k: K, v: SkillForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function selectSkillRef(ref: SkillReference) {
    setForm((f) => ({
      ...f,
      skill_ref_id: ref.id,
      skill_ref_name: ref.name,
      skill_ref_is_custom: ref.is_custom,
      kind: ref.kind,
    }));
    search.clear();
  }

  function selectCustomPending(name: string) {
    setForm((f) => ({
      ...f,
      skill_ref_id: CUSTOM_PENDING,
      skill_ref_name: name,
      skill_ref_is_custom: true,
      kind: "",
    }));
    search.clear();
  }

  function openAddDialog() {
    setEditingId(null);
    setForm(EMPTY_SKILL);
    search.clear();
    dialogOp.clearError();
    setDialogOpen(true);
  }

  function startEdit(skill: Skill) {
    setEditingId(skill.id);
    setForm(skillToForm(skill));
    search.clear();
    dialogOp.clearError();
    setDialogOpen(true);
  }

  function cancelForm() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(EMPTY_SKILL);
    search.clear();
    dialogOp.clearError();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await dialogOp.run(async () => {
      if (editingId) {
        const payload: Record<string, unknown> = {
          self_assessed_level: form.self_assessed_level || null,
          featured: form.featured,
          notes: form.notes || null,
        };
        if (form.skill_ref_is_custom && form.kind) {
          payload.kind = form.kind;
        }
        const updated = await api.put<Skill>(
          `/candidates/me/skills/${editingId}`,
          payload,
        );
        setItems((prev) => prev.map((s) => (s.id === editingId ? updated : s)));
        setEditingId(null);
      } else {
        let skillRefId = form.skill_ref_id;
        if (skillRefId === CUSTOM_PENDING) {
          const ref = await api.post<SkillReference>("/skill-references", {
            name: form.skill_ref_name,
            kind: form.kind,
          });
          skillRefId = ref.id;
        }
        const created = await api.post<Skill>("/candidates/me/skills", {
          skill_ref_id: skillRefId,
          self_assessed_level: form.self_assessed_level || null,
          featured: form.featured,
          notes: form.notes || null,
        });
        setItems((prev) => [...prev, created]);
        setContextSkill(created);
      }
      setForm(EMPTY_SKILL);
      search.clear();
      setDialogOpen(false);
    });
  }

  async function handleDelete(id: string) {
    await dialogOp.run(async () => {
      await api.delete(`/candidates/me/skills/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    });
  }

  async function handleToggleFeatured(skill: Skill) {
    try {
      const updated = await api.put<Skill>(
        `/candidates/me/skills/${skill.id}`,
        {
          featured: !skill.featured,
        },
      );
      setItems((prev) => prev.map((s) => (s.id === skill.id ? updated : s)));
    } catch {
      // ignore toggle errors silently (non-critical)
    }
  }

  const featuredSkills = items.filter((s) => s.featured).slice(0, 6);
  const skillsByKind = KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABELS[kind],
    skills: items.filter((s) => s.skill_ref.kind === kind),
  }));

  const refSelected = !!form.skill_ref_id;

  const associatedRefIds = new Set(
    experiences.flatMap((e) => e.skill_usages.map((u) => u.skill_ref_id)),
  );
  const unassociated = items.filter(
    (s) => !associatedRefIds.has(s.skill_ref_id),
  );

  return (
    <div className="space-y-4">
      {loading && (
        <Card>
          <CardContent className="py-4">
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
          </CardContent>
        </Card>
      )}
      {fetchError && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-destructive">{fetchError}</p>
          </CardContent>
        </Card>
      )}

      {/* ---- Header ---- */}
      {!loading && !fetchError && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {items.length} compétence{items.length !== 1 ? "s" : ""}
          </p>
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Ajouter une compétence
          </Button>
        </div>
      )}

      {dialogOp.error && !dialogOpen && (
        <p className="text-sm text-destructive">{dialogOp.error}</p>
      )}

      {/* ---- Unassociated skills banner ---- */}
      {!loading && !fetchError && unassociated.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {unassociated.length} compétence
            {unassociated.length > 1 ? "s" : ""} non rattachée
            {unassociated.length > 1 ? "s" : ""} à une expérience
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {unassociated.slice(0, 6).map((s) => (
              <span
                key={s.id}
                className="text-xs text-amber-700 dark:text-amber-400"
              >
                {s.skill_ref.name}
                {unassociated.indexOf(s) < Math.min(5, unassociated.length - 1)
                  ? ","
                  : ""}
              </span>
            ))}
            {unassociated.length > 6 && (
              <span className="text-xs text-amber-600 dark:text-amber-500">
                +{unassociated.length - 6} autres
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setContextSkill(unassociated[0])}
            className="mt-2 text-xs font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-400"
          >
            Rattacher ces compétences →
          </button>
        </div>
      )}

      {/* ---- Featured Skills Block ---- */}
      {featuredSkills.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Compétences clés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {featuredSkills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => handleToggleFeatured(skill)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                  title="Retirer des compétences clés"
                >
                  <span>★</span>
                  {skill.skill_ref.name}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- 3x2 grid per kind ---- */}
      {!loading && !fetchError && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {skillsByKind.map(({ kind, label, skills }) => (
            <Card key={kind} className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{label}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 space-y-0.5">
                {skills.length === 0 ? (
                  <p className="py-1 text-xs text-muted-foreground">
                    Aucune compétence dans cette famille.
                  </p>
                ) : (
                  [...skills]
                    .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
                    .map((skill) => (
                      <div
                        key={skill.id}
                        className={`group flex items-center justify-between rounded-md px-2 py-1.5 ${
                          skill.featured ? "bg-primary/5" : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleFeatured(skill)}
                            className={`shrink-0 text-xs transition-colors ${
                              skill.featured
                                ? "text-primary"
                                : "text-muted-foreground/30 hover:text-muted-foreground"
                            }`}
                            title={
                              skill.featured
                                ? "Retirer des clés"
                                : "Mettre en avant"
                            }
                          >
                            ★
                          </button>
                          <span className="truncate text-sm">
                            {skill.skill_ref.name}
                          </span>
                          {skill.self_assessed_level && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {skill.self_assessed_level}/5
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => startEdit(skill)}
                            className="rounded p-1 hover:bg-muted"
                            title="Modifier"
                          >
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(skill.id)}
                            disabled={dialogOp.saving}
                            className="rounded p-1 hover:bg-destructive/10"
                            title={`Supprimer ${skill.skill_ref.name}`}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ---- Add / Edit Dialog ---- */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) cancelForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Modifier la compétence" : "Ajouter une compétence"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Skill ref field */}
            {editingId ? (
              <div className="space-y-1.5">
                <Label>Compétence</Label>
                <div className="flex items-center gap-2">
                  <p className="flex-1 rounded-md bg-muted/30 px-3 py-2 text-sm">
                    {form.skill_ref_name}
                  </p>
                  {form.kind && !form.skill_ref_is_custom && (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {KIND_LABELS[form.kind as SkillKind] ?? form.kind}
                    </Badge>
                  )}
                </div>
              </div>
            ) : !refSelected ? (
              <div className="relative space-y-1.5">
                <Label htmlFor="skill-search">
                  Compétence <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="skill-search"
                  value={search.query}
                  onChange={(e) => {
                    search.setQuery(e.target.value);
                    setForm((prev) => ({
                      ...prev,
                      skill_ref_id: "",
                      skill_ref_name: "",
                      skill_ref_is_custom: false,
                      kind: "",
                    }));
                  }}
                  placeholder="Rechercher une compétence…"
                  autoComplete="off"
                  autoFocus
                />
                {(search.results.length > 0 || search.searching) && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                    {search.searching && search.results.length === 0 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">
                        Recherche…
                      </p>
                    )}
                    {search.results.map((ref) => (
                      <button
                        key={ref.id}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => selectSkillRef(ref)}
                      >
                        <span>{ref.name}</span>
                        <Badge variant="outline" className="ml-auto text-xs">
                          {KIND_LABELS[ref.kind] ?? ref.kind}
                        </Badge>
                      </button>
                    ))}
                    {!search.searching &&
                      !search.results.some(
                        (r) =>
                          r.name.toLowerCase() ===
                          search.query.trim().toLowerCase(),
                      ) && (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={() => selectCustomPending(search.query)}
                        >
                          <Plus className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            Créer «{" "}
                            <span className="font-medium text-foreground">
                              {search.query}
                            </span>{" "}
                            »
                          </span>
                        </button>
                      )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Compétence</Label>
                <div className="flex items-center gap-2">
                  <p className="flex-1 rounded-md bg-muted/30 px-3 py-2 text-sm">
                    {form.skill_ref_name}
                  </p>
                  {!form.skill_ref_is_custom && form.kind && (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {KIND_LABELS[form.kind as SkillKind] ?? form.kind}
                    </Badge>
                  )}
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
                    onClick={() => {
                      setForm((prev) => ({
                        ...prev,
                        skill_ref_id: "",
                        skill_ref_name: "",
                        skill_ref_is_custom: false,
                        kind: "",
                      }));
                      search.clear();
                    }}
                    title="Changer de compétence"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Kind selector - custom skills only */}
            {form.skill_ref_is_custom && (
              <div className="space-y-1.5">
                <Label htmlFor="skill-kind">Catégorie</Label>
                <Select
                  value={form.kind}
                  onValueChange={(v) => set("kind", v as SkillKind)}
                >
                  <SelectTrigger id="skill-kind" className="w-full">
                    <SelectValue placeholder="Choisir une catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    {KIND_ORDER.map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="skill-level">Niveau</Label>
                <Select
                  value={form.self_assessed_level}
                  onValueChange={(v) => v && set("self_assessed_level", v)}
                >
                  <SelectTrigger id="skill-level" className="w-full">
                    <SelectValue placeholder="–" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVEL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.featured}
                    onChange={(e) => set("featured", e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">Compétence clé</span>
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="skill-notes">Notes (facultatif)</Label>
              <Input
                id="skill-notes"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Précisions, contexte…"
              />
            </div>

            {dialogOp.error && (
              <p className="text-sm text-destructive">{dialogOp.error}</p>
            )}

            <DialogFooter>
              <Button
                type="submit"
                size="sm"
                disabled={
                  dialogOp.saving ||
                  (!editingId &&
                    (!form.skill_ref_id ||
                      (form.skill_ref_is_custom && !form.kind)))
                }
              >
                {dialogOp.saving
                  ? "Sauvegarde…"
                  : editingId
                    ? "Enregistrer"
                    : "Ajouter"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---- Contextualization dialog (after skill creation) ---- */}
      {contextSkill && (
        <SkillContextualizationDialog
          skill={contextSkill}
          allSkills={unassociated.length > 1 ? unassociated : undefined}
          initialIndex={
            unassociated.length > 1
              ? Math.max(
                  0,
                  unassociated.findIndex((s) => s.id === contextSkill.id),
                )
              : undefined
          }
          experiences={experiences}
          onAssociated={(expIds, associatedSkill) => {
            setExperiences((prev) =>
              prev.map((exp) =>
                expIds.includes(exp.id)
                  ? {
                      ...exp,
                      skill_usages: [
                        ...exp.skill_usages,
                        {
                          id: `tmp-${associatedSkill.skill_ref_id}-${exp.id}`,
                          experience_id: exp.id,
                          skill_ref_id: associatedSkill.skill_ref_id,
                          skill_ref: associatedSkill.skill_ref,
                          intensity: "secondary" as const,
                          created_at: new Date().toISOString(),
                        },
                      ],
                    }
                  : exp,
              ),
            );
          }}
          onClose={() => setContextSkill(null)}
        />
      )}
    </div>
  );
}
