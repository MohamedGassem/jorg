// frontend/components/candidate/skill-section.tsx
"use client";

import { useEffect, useState } from "react";
import { Plus, X, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
import { SkillChip } from "@/components/ui/SkillChip";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useAsyncOp } from "@/lib/hooks/useAsyncOp";
import { useSearchableSelect } from "@/lib/hooks/useSearchableSelect";
import { assembleSkillRows, type SkillRow } from "@/lib/skill-proof";
import { SkillContextualizationDialog } from "@/components/candidate/SkillContextualizationDialog";
import type {
  CandidateSkillProjection,
  Experience,
  Skill,
  SkillReference,
  SkillKind,
} from "@/types/api";

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

export function SkillSection({
  onSkillsChange,
}: {
  onSkillsChange?: (items: Skill[]) => void;
} = {}) {
  const [items, setItems] = useState<Skill[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [projection, setProjection] = useState<CandidateSkillProjection[]>([]);
  const [expandedRef, setExpandedRef] = useState<string | null>(null);
  const [declaredOpen, setDeclaredOpen] = useState(false);
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
      api.get<CandidateSkillProjection[]>("/candidates/me/skill-projection"),
    ])
      .then(([skills, exps, proj]) => {
        setItems(skills);
        setExperiences(exps);
        setProjection(proj);
      })
      .catch((err) =>
        setFetchError(
          extractErrorMessage(err, "Impossible de charger les compétences"),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  // Tenir le rail "Mon profil" à jour après chaque édition. On ne remonte pas
  // l'état initial vide (loading) pour ne pas écraser le chargement du parent.
  useEffect(() => {
    if (loading) return;
    onSkillsChange?.(items);
  }, [items, loading, onSkillsChange]);

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

  // Proof grouping (plan tranche 2) : proven + featured shown in full, the
  // rest folded and grouped by type behind a "+ N autres" disclosure.
  const { highlighted, declared } = assembleSkillRows(
    items,
    projection,
    experiences,
  );
  const declaredByKind = KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABELS[kind],
    rows: declared.filter((r) => r.kind === kind),
  })).filter((g) => g.rows.length > 0);
  const expandedRow =
    expandedRef != null
      ? (highlighted.find((r) => r.skillRefId === expandedRef) ?? null)
      : null;
  const itemById = new Map(items.map((s) => [s.id, s]));

  // A proof chip plus its hover/focus edit affordances (garde-fou n°1: every
  // editable datum keeps a one-click affordance). Proven chips with links
  // toggle the proof panel on click.
  function renderChip(row: SkillRow) {
    const skill = itemById.get(row.id);
    const canExpand = row.state === "proven" && row.links.length > 0;
    return (
      <span key={row.id} className="group inline-flex items-center gap-0.5">
        <SkillChip
          label={row.name}
          proof={{ state: row.state, featured: row.featured, count: row.count }}
          {...(canExpand
            ? {
                onClick: () =>
                  setExpandedRef((cur) =>
                    cur === row.skillRefId ? null : row.skillRefId,
                  ),
                expanded: expandedRef === row.skillRefId,
              }
            : {})}
        />
        {skill && (
          <span className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={() => handleToggleFeatured(skill)}
              className={`rounded p-0.5 text-xs transition-colors ${
                row.featured
                  ? "text-primary"
                  : "text-muted-foreground/40 hover:text-muted-foreground"
              }`}
              title={row.featured ? "Retirer des clés" : "Mettre en avant"}
            >
              ★
            </button>
            <button
              type="button"
              onClick={() => startEdit(skill)}
              className="rounded p-0.5 hover:bg-muted"
              title="Modifier"
            >
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(row.id)}
              disabled={dialogOp.saving}
              className="rounded p-0.5 hover:bg-destructive/10"
              title={`Supprimer ${row.name}`}
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </button>
          </span>
        )}
      </span>
    );
  }

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

      {/* ---- Proof grouping : proven & featured shown in full ---- */}
      {!loading && !fetchError && items.length > 0 && (
        <Card>
          <CardContent className="space-y-4 py-4">
            {highlighted.length > 0 ? (
              <div className="space-y-2">
                <p className="j-overline">Prouvées et clés</p>
                <div className="flex flex-wrap items-center gap-2">
                  {highlighted.map(renderChip)}
                </div>
                {expandedRow && (
                  <div className="mt-1 space-y-1 border-l-2 border-accent-line pl-3 text-xs text-muted-foreground">
                    <p className="j-overline">Preuves · {expandedRow.name}</p>
                    {expandedRow.links.map((link, i) => (
                      <p key={`${link.experienceId}-${i}`}>
                        <span className="font-medium text-foreground">
                          {link.client}
                        </span>{" "}
                        · {link.role}
                        {link.achievement && (
                          <span className="text-muted-foreground">
                            {" "}
                            — {link.achievement}
                          </span>
                        )}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Aucune compétence prouvée pour l&apos;instant. Reliez vos
                compétences à vos réalisations pour les faire remonter.
              </p>
            )}

            {/* ---- Declared, folded and grouped by type ---- */}
            {declared.length > 0 && (
              <div className="border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => setDeclaredOpen((o) => !o)}
                  aria-expanded={declaredOpen}
                  className="text-[12.5px] font-medium text-primary hover:underline"
                >
                  {declaredOpen ? "− Masquer" : "+"}{" "}
                  {declaredOpen
                    ? "les compétences déclarées"
                    : `${declared.length} autre${
                        declared.length > 1 ? "s" : ""
                      } compétence${
                        declared.length > 1 ? "s" : ""
                      } déclarée${declared.length > 1 ? "s" : ""}`}
                </button>
                {declaredOpen && (
                  <div className="mt-3 space-y-3">
                    {declaredByKind.map(({ kind, label, rows }) => (
                      <div key={kind} className="space-y-1.5">
                        <p className="j-overline">{label}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {rows.map(renderChip)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
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
                          source: "manual_candidate" as const,
                          review_status: "accepted" as const,
                          confidence: null,
                          validated_at: null,
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
