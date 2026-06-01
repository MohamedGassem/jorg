// frontend/app/(candidate)/candidate/skills/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Plus, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import type {
  Experience,
  Skill,
  SkillReference,
  SkillKind,
  Education,
  Certification,
  Language,
  LanguageLevel,
} from "@/types/api";

// ---- shared helpers ----------------------------------------------------------

const LANGUAGE_LEVELS: { value: LanguageLevel; label: string }[] = [
  { value: "A1", label: "A1 — Débutant" },
  { value: "A2", label: "A2 — Élémentaire" },
  { value: "B1", label: "B1 — Intermédiaire" },
  { value: "B2", label: "B2 — Indépendant" },
  { value: "C1", label: "C1 — Avancé" },
  { value: "C2", label: "C2 — Maîtrise" },
  { value: "native", label: "Langue maternelle" },
];

function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? url
      : null;
  } catch {
    return null;
  }
}

function Textarea({
  id,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    />
  );
}

function LevelDots({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i < rating ? "bg-primary" : "bg-muted-foreground/25"}`}
        />
      ))}
    </span>
  );
}

function SectionAddButton({
  adding,
  onToggle,
}: {
  adding: boolean;
  onToggle: () => void;
}) {
  return (
    <Button variant="outline" size="sm" onClick={onToggle} className="gap-1.5">
      {adding ? (
        <>
          <X className="size-3.5" />
          Annuler
        </>
      ) : (
        <>
          <Plus className="size-3.5" />
          Ajouter
        </>
      )}
    </Button>
  );
}

function ItemActions({
  deleteLabel,
  onEdit,
  onDelete,
}: {
  deleteLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        aria-label="Modifier"
        onClick={onEdit}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
      >
        <Pencil className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={deleteLabel}
        onClick={onDelete}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

// ---- Experiences ------------------------------------------------------------

type ExpForm = {
  client_name: string;
  role: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  description: string;
  context: string;
  achievements: string;
  technologies: string;
};

const EMPTY_EXP: ExpForm = {
  client_name: "",
  role: "",
  start_date: "",
  end_date: "",
  is_current: false,
  description: "",
  context: "",
  achievements: "",
  technologies: "",
};

function expToForm(exp: Experience): ExpForm {
  return {
    client_name: exp.client_name,
    role: exp.role,
    start_date: exp.start_date,
    end_date: exp.end_date ?? "",
    is_current: exp.is_current,
    description: exp.description ?? "",
    context: exp.context ?? "",
    achievements: exp.achievements ?? "",
    technologies: exp.technologies.join(", "),
  };
}

function ExperienceSection() {
  const [items, setItems] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExpForm>(EMPTY_EXP);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Experience[]>("/candidates/me/experiences")
      .then(setItems)
      .catch((err) =>
        setFetchError(
          extractErrorMessage(err, "Impossible de charger les expériences"),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof ExpForm>(k: K, v: ExpForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function startEdit(exp: Experience) {
    setAdding(false);
    setEditingId(exp.id);
    setForm(expToForm(exp));
    setError(null);
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
    setForm(EMPTY_EXP);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      client_name: form.client_name,
      role: form.role,
      start_date: form.start_date,
      end_date: form.is_current ? null : form.end_date || null,
      is_current: form.is_current,
      description: form.description || null,
      context: form.context || null,
      achievements: form.achievements || null,
      technologies: form.technologies
        ? form.technologies
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    };
    try {
      if (editingId) {
        const updated = await api.put<Experience>(
          `/candidates/me/experiences/${editingId}`,
          body,
        );
        setItems((prev) => prev.map((i) => (i.id === editingId ? updated : i)));
        setEditingId(null);
      } else {
        const created = await api.post<Experience>(
          "/candidates/me/experiences",
          body,
        );
        setItems((prev) => [...prev, created]);
        setAdding(false);
      }
      setForm(EMPTY_EXP);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur lors de la sauvegarde"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/candidates/me/experiences/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur lors de la suppression"));
    }
  }

  const inlineForm = (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="exp-client">
            Client <span className="text-destructive">*</span>
          </Label>
          <Input
            id="exp-client"
            value={form.client_name}
            onChange={(e) => set("client_name", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exp-role">
            Rôle <span className="text-destructive">*</span>
          </Label>
          <Input
            id="exp-role"
            value={form.role}
            onChange={(e) => set("role", e.target.value)}
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="exp-start">
            Date début <span className="text-destructive">*</span>
          </Label>
          <Input
            id="exp-start"
            type="date"
            value={form.start_date}
            onChange={(e) => set("start_date", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exp-end">Date fin</Label>
          <Input
            id="exp-end"
            type="date"
            value={form.end_date}
            onChange={(e) => set("end_date", e.target.value)}
            disabled={form.is_current}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="exp-current"
          type="checkbox"
          checked={form.is_current}
          onChange={(e) => {
            set("is_current", e.target.checked);
            if (e.target.checked) set("end_date", "");
          }}
          className="h-4 w-4 cursor-pointer accent-primary"
        />
        <Label htmlFor="exp-current" className="cursor-pointer font-normal">
          Poste actuel
        </Label>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="exp-tech">Technologies (séparées par virgule)</Label>
        <Input
          id="exp-tech"
          value={form.technologies}
          onChange={(e) => set("technologies", e.target.value)}
          placeholder="React, TypeScript, Node.js"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="exp-desc">Description</Label>
        <Textarea
          id="exp-desc"
          value={form.description}
          onChange={(v) => set("description", v)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="exp-context">Contexte</Label>
        <Textarea
          id="exp-context"
          value={form.context}
          onChange={(v) => set("context", v)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="exp-achiev">Réalisations</Label>
        <Textarea
          id="exp-achiev"
          value={form.achievements}
          onChange={(v) => set("achievements", v)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving
            ? "Sauvegarde…"
            : editingId
              ? "Enregistrer"
              : "Ajouter l'expérience"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={cancelForm}>
          Annuler
        </Button>
      </div>
    </form>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Expériences professionnelles</CardTitle>
        <SectionAddButton
          adding={adding && !editingId}
          onToggle={() => {
            cancelForm();
            setAdding((v) => !v);
          }}
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <div className="h-16 animate-pulse rounded-lg bg-muted" />}
        {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}
        {!loading && !fetchError && items.length === 0 && !adding && (
          <p className="py-2 text-sm text-muted-foreground">
            Aucune expérience ajoutée.
          </p>
        )}
        {items.map((exp) =>
          editingId === exp.id ? (
            <div key={exp.id}>{inlineForm}</div>
          ) : (
            <div
              key={exp.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-3"
            >
              <div className="min-w-0 space-y-1">
                <p className="truncate font-medium">
                  {exp.role}{" "}
                  <span className="font-normal text-muted-foreground">
                    — {exp.client_name}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {exp.start_date} →{" "}
                  {exp.is_current ? "présent" : (exp.end_date ?? "")}
                </p>
                {(exp.technologies?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {exp.technologies.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <ItemActions
                deleteLabel="Supprimer cette expérience"
                onEdit={() => startEdit(exp)}
                onDelete={() => handleDelete(exp.id)}
              />
            </div>
          ),
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {adding && !editingId && inlineForm}
      </CardContent>
    </Card>
  );
}

// ---- Skills -----------------------------------------------------------------

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
  { value: "1", label: "1/5 — Notions" },
  { value: "2", label: "2/5 — Débutant" },
  { value: "3", label: "3/5 — Intermédiaire" },
  { value: "4", label: "4/5 — Confirmé" },
  { value: "5", label: "5/5 — Expert" },
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

function SkillSection() {
  const [items, setItems] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SkillForm>(EMPTY_SKILL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SkillReference[]>([]);
  const [searching, setSearching] = useState(false);
  const skipNextSearch = useRef(false);

  useEffect(() => {
    api
      .get<Skill[]>("/candidates/me/skills")
      .then(setItems)
      .catch((err) =>
        setFetchError(
          extractErrorMessage(err, "Impossible de charger les compétences"),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    if (!searchQuery || searchQuery.length < 2 || editingId) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await api.get<SkillReference[]>(
          `/skill-references?q=${encodeURIComponent(searchQuery)}`,
        );
        setSearchResults(results);
      } catch {
        // ignore search errors
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, editingId]);

  function set<K extends keyof SkillForm>(k: K, v: SkillForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function selectSkillRef(ref: SkillReference) {
    skipNextSearch.current = true;
    setForm((f) => ({
      ...f,
      skill_ref_id: ref.id,
      skill_ref_name: ref.name,
      skill_ref_is_custom: ref.is_custom,
      kind: ref.kind,
    }));
    setSearchQuery("");
    setSearchResults([]);
  }

  function startEdit(skill: Skill) {
    setAdding(false);
    setEditingId(skill.id);
    setForm(skillToForm(skill));
    setSearchQuery("");
    setError(null);
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
    setForm(EMPTY_SKILL);
    setSearchQuery("");
    setSearchResults([]);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
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
        const created = await api.post<Skill>("/candidates/me/skills", {
          skill_ref_id: form.skill_ref_id,
          self_assessed_level: form.self_assessed_level || null,
          featured: form.featured,
          notes: form.notes || null,
        });
        setItems((prev) => [...prev, created]);
        setAdding(false);
      }
      setForm(EMPTY_SKILL);
      setSearchQuery("");
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur lors de la sauvegarde"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/candidates/me/skills/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur lors de la suppression"));
    }
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
      setError("Impossible de modifier la mise en avant");
    }
  }

  function renderSkillForm() {
    return (
      <form onSubmit={handleSubmit} className="space-y-3">
        {editingId ? (
          <div className="space-y-1.5">
            <Label>Compétence</Label>
            <p className="rounded-md bg-muted/30 px-3 py-2 text-sm">
              {form.skill_ref_name}
            </p>
          </div>
        ) : (
          <div className="relative space-y-1.5">
            <Label htmlFor="skill-search">
              Compétence <span className="text-destructive">*</span>
            </Label>
            <Input
              id="skill-search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setForm((prev) => ({
                  ...prev,
                  skill_ref_id: "",
                  skill_ref_name: "",
                  skill_ref_is_custom: false,
                }));
              }}
              placeholder="Rechercher une compétence…"
              autoComplete="off"
            />
            {(searchResults.length > 0 || searching) && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                {searching && searchResults.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Recherche…
                  </p>
                )}
                {searchResults.map((ref) => (
                  <button
                    key={ref.id}
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => selectSkillRef(ref)}
                  >
                    <span>{ref.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {KIND_LABELS[ref.kind] ?? ref.kind}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
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
              <span className="text-sm">Mise en avant</span>
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
        {form.skill_ref_is_custom && (
          <div className="space-y-1.5">
            <Label htmlFor="skill-kind">Type</Label>
            <Select
              value={form.kind}
              onValueChange={(v) => set("kind", v as SkillKind)}
            >
              <SelectTrigger id="skill-kind" className="w-full">
                <SelectValue placeholder="Choisir un type" />
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
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={saving || (!editingId && !form.skill_ref_id)}
          >
            {saving
              ? "Sauvegarde…"
              : editingId
                ? "Enregistrer"
                : "Ajouter la compétence"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={cancelForm}>
            Annuler
          </Button>
        </div>
      </form>
    );
  }

  // Compute groups
  const featuredSkills = items.filter((s) => s.featured).slice(0, 6);
  const skillsByKind = KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABELS[kind],
    skills: items.filter((s) => s.skill_ref.kind === kind),
  })).filter((g) => g.skills.length > 0);

  return (
    <div className="space-y-6">
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
      {error && <p className="text-sm text-destructive">{error}</p>}

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

      {/* ---- Sections per type ---- */}
      {skillsByKind.map(({ kind, label, skills }) => (
        <Card key={kind}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">{label}</CardTitle>
              <SectionAddButton
                adding={adding && !editingId && form.kind === kind}
                onToggle={() => {
                  setAdding((v) => !v);
                  setForm({ ...EMPTY_SKILL, kind });
                  setEditingId(null);
                }}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {adding && !editingId && form.kind === kind && (
              <div className="rounded-lg border border-dashed p-4">
                {renderSkillForm()}
              </div>
            )}
            {[...skills]
              .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
              .map((skill) => (
                <div
                  key={skill.id}
                  className={`flex items-center justify-between rounded-md px-3 py-2 ${
                    skill.featured ? "bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleFeatured(skill)}
                      className={`shrink-0 text-sm transition-colors ${
                        skill.featured
                          ? "text-primary"
                          : "text-muted-foreground/30 hover:text-muted-foreground"
                      }`}
                      title={
                        skill.featured ? "Retirer des clés" : "Mettre en avant"
                      }
                    >
                      ★
                    </button>
                    <span className="truncate text-sm font-medium">
                      {skill.skill_ref.name}
                    </span>
                    {skill.self_assessed_level && (
                      <span className="text-xs text-muted-foreground">
                        {skill.self_assessed_level}
                      </span>
                    )}
                  </div>
                  <ItemActions
                    deleteLabel={`Supprimer ${skill.skill_ref.name}`}
                    onEdit={() => startEdit(skill)}
                    onDelete={() => handleDelete(skill.id)}
                  />
                </div>
              ))}
            {editingId && skills.find((s) => s.id === editingId) && (
              <div className="rounded-lg border border-dashed p-4">
                {renderSkillForm()}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* ---- Empty state ---- */}
      {!loading && !fetchError && items.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="mb-3 text-sm text-muted-foreground">
              Aucune compétence ajoutée
            </p>
            <SectionAddButton
              adding={adding}
              onToggle={() => {
                setAdding((v) => !v);
                setForm(EMPTY_SKILL);
                setEditingId(null);
              }}
            />
            {adding && (
              <div className="mt-4 rounded-lg border border-dashed p-4 text-left">
                {renderSkillForm()}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---- Education --------------------------------------------------------------

type EduForm = {
  school: string;
  degree: string;
  field_of_study: string;
  start_date: string;
  end_date: string;
  description: string;
};

const EMPTY_EDU: EduForm = {
  school: "",
  degree: "",
  field_of_study: "",
  start_date: "",
  end_date: "",
  description: "",
};

function eduToForm(edu: Education): EduForm {
  return {
    school: edu.school,
    degree: edu.degree ?? "",
    field_of_study: edu.field_of_study ?? "",
    start_date: edu.start_date ?? "",
    end_date: edu.end_date ?? "",
    description: edu.description ?? "",
  };
}

function EducationSection() {
  const [items, setItems] = useState<Education[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EduForm>(EMPTY_EDU);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Education[]>("/candidates/me/education")
      .then(setItems)
      .catch((err) =>
        setFetchError(
          extractErrorMessage(err, "Impossible de charger les formations"),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof EduForm>(k: K, v: EduForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function startEdit(edu: Education) {
    setAdding(false);
    setEditingId(edu.id);
    setForm(eduToForm(edu));
    setError(null);
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
    setForm(EMPTY_EDU);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      school: form.school,
      degree: form.degree || null,
      field_of_study: form.field_of_study || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      description: form.description || null,
    };
    try {
      if (editingId) {
        const updated = await api.put<Education>(
          `/candidates/me/education/${editingId}`,
          body,
        );
        setItems((prev) => prev.map((i) => (i.id === editingId ? updated : i)));
        setEditingId(null);
      } else {
        const created = await api.post<Education>(
          "/candidates/me/education",
          body,
        );
        setItems((prev) => [...prev, created]);
        setAdding(false);
      }
      setForm(EMPTY_EDU);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur lors de la sauvegarde"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/candidates/me/education/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur lors de la suppression"));
    }
  }

  const inlineForm = (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="edu-school">
          {"École / Établissement"} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="edu-school"
          value={form.school}
          onChange={(e) => set("school", e.target.value)}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="edu-degree">Diplôme</Label>
          <Input
            id="edu-degree"
            value={form.degree}
            onChange={(e) => set("degree", e.target.value)}
            placeholder="ex: Master, Licence…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edu-field">{"Domaine d'études"}</Label>
          <Input
            id="edu-field"
            value={form.field_of_study}
            onChange={(e) => set("field_of_study", e.target.value)}
            placeholder="ex: Informatique"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="edu-start">Date début</Label>
          <Input
            id="edu-start"
            type="date"
            value={form.start_date}
            onChange={(e) => set("start_date", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edu-end">Date fin</Label>
          <Input
            id="edu-end"
            type="date"
            value={form.end_date}
            onChange={(e) => set("end_date", e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edu-desc">Description</Label>
        <Textarea
          id="edu-desc"
          value={form.description}
          onChange={(v) => set("description", v)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving
            ? "Sauvegarde…"
            : editingId
              ? "Enregistrer"
              : "Ajouter la formation"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={cancelForm}>
          Annuler
        </Button>
      </div>
    </form>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Formation</CardTitle>
        <SectionAddButton
          adding={adding && !editingId}
          onToggle={() => {
            cancelForm();
            setAdding((v) => !v);
          }}
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <div className="h-16 animate-pulse rounded-lg bg-muted" />}
        {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}
        {!loading && !fetchError && items.length === 0 && !adding && (
          <p className="py-2 text-sm text-muted-foreground">
            Aucune formation ajoutée.
          </p>
        )}
        {items.map((edu) =>
          editingId === edu.id ? (
            <div key={edu.id}>{inlineForm}</div>
          ) : (
            <div
              key={edu.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-3"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">{edu.school}</p>
                <p className="text-sm text-muted-foreground">
                  {[edu.degree, edu.field_of_study].filter(Boolean).join(" · ")}
                </p>
                {(edu.start_date || edu.end_date) && (
                  <p className="text-xs text-muted-foreground">
                    {edu.start_date ?? ""} → {edu.end_date ?? ""}
                  </p>
                )}
              </div>
              <ItemActions
                deleteLabel="Supprimer cette formation"
                onEdit={() => startEdit(edu)}
                onDelete={() => handleDelete(edu.id)}
              />
            </div>
          ),
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {adding && !editingId && inlineForm}
      </CardContent>
    </Card>
  );
}

// ---- Certifications ---------------------------------------------------------

type CertForm = {
  name: string;
  issuer: string;
  issue_date: string;
  expiry_date: string;
  credential_url: string;
};

const EMPTY_CERT: CertForm = {
  name: "",
  issuer: "",
  issue_date: "",
  expiry_date: "",
  credential_url: "",
};

function certToForm(cert: Certification): CertForm {
  return {
    name: cert.name,
    issuer: cert.issuer,
    issue_date: cert.issue_date,
    expiry_date: cert.expiry_date ?? "",
    credential_url: cert.credential_url ?? "",
  };
}

function CertificationSection() {
  const [items, setItems] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CertForm>(EMPTY_CERT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Certification[]>("/candidates/me/certifications")
      .then(setItems)
      .catch((err) =>
        setFetchError(
          extractErrorMessage(err, "Impossible de charger les certifications"),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof CertForm>(k: K, v: CertForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function startEdit(cert: Certification) {
    setAdding(false);
    setEditingId(cert.id);
    setForm(certToForm(cert));
    setError(null);
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
    setForm(EMPTY_CERT);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      name: form.name,
      issuer: form.issuer,
      issue_date: form.issue_date,
      expiry_date: form.expiry_date || null,
      credential_url: form.credential_url || null,
    };
    try {
      if (editingId) {
        const updated = await api.put<Certification>(
          `/candidates/me/certifications/${editingId}`,
          body,
        );
        setItems((prev) => prev.map((i) => (i.id === editingId ? updated : i)));
        setEditingId(null);
      } else {
        const created = await api.post<Certification>(
          "/candidates/me/certifications",
          body,
        );
        setItems((prev) => [...prev, created]);
        setAdding(false);
      }
      setForm(EMPTY_CERT);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur lors de la sauvegarde"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/candidates/me/certifications/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur lors de la suppression"));
    }
  }

  const inlineForm = (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cert-name">
            Nom <span className="text-destructive">*</span>
          </Label>
          <Input
            id="cert-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cert-issuer">
            Organisme <span className="text-destructive">*</span>
          </Label>
          <Input
            id="cert-issuer"
            value={form.issuer}
            onChange={(e) => set("issuer", e.target.value)}
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cert-issue">
            {"Date d'obtention"} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="cert-issue"
            type="date"
            value={form.issue_date}
            onChange={(e) => set("issue_date", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cert-expiry">{"Date d'expiration"}</Label>
          <Input
            id="cert-expiry"
            type="date"
            value={form.expiry_date}
            onChange={(e) => set("expiry_date", e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cert-url">URL du certificat</Label>
        <Input
          id="cert-url"
          type="url"
          value={form.credential_url}
          onChange={(e) => set("credential_url", e.target.value)}
          placeholder="https://…"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving
            ? "Sauvegarde…"
            : editingId
              ? "Enregistrer"
              : "Ajouter la certification"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={cancelForm}>
          Annuler
        </Button>
      </div>
    </form>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Certifications</CardTitle>
        <SectionAddButton
          adding={adding && !editingId}
          onToggle={() => {
            cancelForm();
            setAdding((v) => !v);
          }}
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <div className="h-16 animate-pulse rounded-lg bg-muted" />}
        {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}
        {!loading && !fetchError && items.length === 0 && !adding && (
          <p className="py-2 text-sm text-muted-foreground">
            Aucune certification ajoutée.
          </p>
        )}
        {items.map((cert) =>
          editingId === cert.id ? (
            <div key={cert.id}>{inlineForm}</div>
          ) : (
            <div
              key={cert.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-3"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">{cert.name}</p>
                <p className="text-sm text-muted-foreground">
                  {cert.issuer} · {cert.issue_date}
                  {cert.expiry_date ? ` → ${cert.expiry_date}` : ""}
                </p>
                {safeUrl(cert.credential_url) && (
                  <a
                    href={safeUrl(cert.credential_url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Voir le certificat →
                  </a>
                )}
              </div>
              <ItemActions
                deleteLabel="Supprimer cette certification"
                onEdit={() => startEdit(cert)}
                onDelete={() => handleDelete(cert.id)}
              />
            </div>
          ),
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {adding && !editingId && inlineForm}
      </CardContent>
    </Card>
  );
}

// ---- Languages --------------------------------------------------------------

type LangForm = { name: string; level: LanguageLevel };
const EMPTY_LANG: LangForm = { name: "", level: "B2" };

function LanguageSection() {
  const [items, setItems] = useState<Language[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LangForm>(EMPTY_LANG);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Language[]>("/candidates/me/languages")
      .then(setItems)
      .catch((err) =>
        setFetchError(
          extractErrorMessage(err, "Impossible de charger les langues"),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  function startEdit(lang: Language) {
    setAdding(false);
    setEditingId(lang.id);
    setForm({ name: lang.name, level: lang.level });
    setError(null);
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
    setForm(EMPTY_LANG);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const updated = await api.put<Language>(
          `/candidates/me/languages/${editingId}`,
          form,
        );
        setItems((prev) => prev.map((i) => (i.id === editingId ? updated : i)));
        setEditingId(null);
      } else {
        const created = await api.post<Language>(
          "/candidates/me/languages",
          form,
        );
        setItems((prev) => [...prev, created]);
        setAdding(false);
      }
      setForm(EMPTY_LANG);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur lors de la sauvegarde"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/candidates/me/languages/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur lors de la suppression"));
    }
  }

  const inlineForm = (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="lang-name">
            Langue <span className="text-destructive">*</span>
          </Label>
          <Input
            id="lang-name"
            value={form.name}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="ex: Français, Anglais…"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lang-level">
            Niveau <span className="text-destructive">*</span>
          </Label>
          <Select
            value={form.level}
            onValueChange={(v) =>
              v && setForm((prev) => ({ ...prev, level: v as LanguageLevel }))
            }
          >
            <SelectTrigger id="lang-level" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_LEVELS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving
            ? "Sauvegarde…"
            : editingId
              ? "Enregistrer"
              : "Ajouter la langue"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={cancelForm}>
          Annuler
        </Button>
      </div>
    </form>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Langues</CardTitle>
        <SectionAddButton
          adding={adding && !editingId}
          onToggle={() => {
            cancelForm();
            setAdding((v) => !v);
          }}
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <div className="h-16 animate-pulse rounded-lg bg-muted" />}
        {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}
        {!loading && !fetchError && items.length === 0 && !adding && (
          <p className="py-2 text-sm text-muted-foreground">
            Aucune langue ajoutée.
          </p>
        )}
        {items.map((lang) =>
          editingId === lang.id ? (
            <div key={lang.id}>{inlineForm}</div>
          ) : (
            <div
              key={lang.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-3"
            >
              <div className="flex items-center gap-2.5">
                <p className="font-medium">{lang.name}</p>
                <Badge variant="secondary" className="text-xs">
                  {lang.level}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {
                    LANGUAGE_LEVELS.find(
                      (l) => l.value === lang.level,
                    )?.label.split(" — ")[1]
                  }
                </span>
              </div>
              <ItemActions
                deleteLabel="Supprimer cette langue"
                onEdit={() => startEdit(lang)}
                onDelete={() => handleDelete(lang.id)}
              />
            </div>
          ),
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {adding && !editingId && inlineForm}
      </CardContent>
    </Card>
  );
}

// ---- Page -------------------------------------------------------------------

export default function SkillsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Profil de compétences
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Expériences, compétences, formations et certifications utilisées pour
          générer vos profils.
        </p>
      </div>
      <ExperienceSection />
      <SkillSection />
      <EducationSection />
      <CertificationSection />
      <LanguageSection />
    </div>
  );
}
