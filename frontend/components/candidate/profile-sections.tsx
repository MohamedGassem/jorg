// frontend/components/candidate/profile-sections.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  Trash2,
  Plus,
  X,
  Pencil,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useSearchableSelect } from "@/lib/hooks/useSearchableSelect";
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
import { SkillContextualizationDialog } from "@/components/candidate/SkillContextualizationDialog";
import { useCrudSection } from "@/lib/hooks/useCrudSection";
import { EmptyState } from "@/components/ui/EmptyState";
import type {
  Achievement,
  AchievementSkillTag,
  Experience,
  ExperienceSkillUsage,
  Skill,
  SkillReference,
  SkillKind,
  Education,
  Certification,
  Language,
  LanguageReference,
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
};

const EMPTY_EXP: ExpForm = {
  client_name: "",
  role: "",
  start_date: "",
  end_date: "",
  is_current: false,
  description: "",
  context: "",
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
  };
}

type AchForm = {
  description: string;
  impact: string;
};

function SkillChipPicker({
  skillUsages,
  checkedIds,
  onToggle,
}: {
  skillUsages: ExperienceSkillUsage[];
  checkedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (skillUsages.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        Skills associés à cette réalisation
      </p>
      <div className="flex flex-wrap gap-1.5">
        {skillUsages.map((u) => {
          const checked = checkedIds.has(u.skill_ref_id);
          return (
            <button
              key={u.skill_ref_id}
              type="button"
              onClick={() => onToggle(u.skill_ref_id)}
              className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${
                checked
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-border/80"
              }`}
            >
              {u.skill_ref.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AchievementRow({
  ach,
  skillUsages,
  candidateSkills,
  expId,
  onSaved,
  onDeleted,
  onSkillAddedToBouquet,
}: {
  ach: Achievement;
  skillUsages: ExperienceSkillUsage[];
  candidateSkills: Skill[];
  expId: string;
  onSaved: (updated: Achievement) => void;
  onDeleted: (id: string) => void;
  onSkillAddedToBouquet: (usage: ExperienceSkillUsage) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AchForm>({
    description: ach.description,
    impact: ach.impact ?? "",
  });
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    new Set(ach.skill_tags.map((t) => t.skill_ref_id)),
  );
  const saveOp = useAsyncOp("Erreur lors de la sauvegarde");
  const deleteOp = useAsyncOp("Erreur lors de la suppression");
  const syncedTagsRef = useRef<Set<string>>(
    new Set(ach.skill_tags.map((t) => t.skill_ref_id)),
  );

  function openForm() {
    saveOp.clearError();
    deleteOp.clearError();
    syncedTagsRef.current = new Set(ach.skill_tags.map((t) => t.skill_ref_id));
    setForm({ description: ach.description, impact: ach.impact ?? "" });
    setCheckedIds(new Set(ach.skill_tags.map((t) => t.skill_ref_id)));
    setOpen(true);
  }

  async function handleSave() {
    await saveOp.run(async () => {
      const updated = await api.put<Achievement>(
        `/candidates/me/experiences/${expId}/achievements/${ach.id}`,
        { description: form.description || null, impact: form.impact || null },
      );
      const existingIds = new Set(syncedTagsRef.current);
      const toDelete = [...existingIds].filter((id) => !checkedIds.has(id));
      const toAdd = [...checkedIds].filter((id) => !existingIds.has(id));

      const deleteResults = await Promise.allSettled(
        toDelete.map((id) =>
          api
            .delete(
              `/candidates/me/experiences/${expId}/achievements/${ach.id}/skill-tags/${id}`,
            )
            .then(() => ({ op: "delete" as const, id })),
        ),
      );
      const addResults = await Promise.allSettled(
        toAdd.map((id) =>
          api
            .post(
              `/candidates/me/experiences/${expId}/achievements/${ach.id}/skill-tags`,
              { skill_ref_id: id },
            )
            .then(() => ({ op: "add" as const, id })),
        ),
      );

      const successfulDeletes = new Set(
        deleteResults
          .filter(
            (r): r is PromiseFulfilledResult<{ op: "delete"; id: string }> =>
              r.status === "fulfilled",
          )
          .map((r) => r.value.id),
      );
      const successfulAdds = new Set(
        addResults
          .filter(
            (r): r is PromiseFulfilledResult<{ op: "add"; id: string }> =>
              r.status === "fulfilled",
          )
          .map((r) => r.value.id),
      );

      const newSynced = new Set(syncedTagsRef.current);
      for (const id of successfulDeletes) newSynced.delete(id);
      for (const id of successfulAdds) newSynced.add(id);
      syncedTagsRef.current = newSynced;

      const anyFailed =
        deleteResults.some((r) => r.status === "rejected") ||
        addResults.some((r) => r.status === "rejected");

      if (anyFailed) {
        throw new Error(
          "Certains tags n'ont pas pu être synchronisés. Réessayez.",
        );
      }
      const newTags: AchievementSkillTag[] = skillUsages
        .filter((u) => checkedIds.has(u.skill_ref_id))
        .map((u) => ({
          skill_ref_id: u.skill_ref_id,
          skill_ref: u.skill_ref,
          created_at: new Date().toISOString(),
        }));
      onSaved({ ...updated, skill_tags: newTags });
      setOpen(false);
    });
  }

  async function handleDelete() {
    await deleteOp.run(async () => {
      await api.delete(
        `/candidates/me/experiences/${expId}/achievements/${ach.id}`,
      );
      onDeleted(ach.id);
    });
  }

  return (
    <div>
      <div
        className={`group flex items-start gap-2 rounded-md px-2 py-1.5 ${open ? "bg-muted/20" : "hover:bg-muted/10"}`}
      >
        <span className="mt-0.5 shrink-0 text-muted-foreground">•</span>
        <div className="min-w-0 flex-1">
          <span className="text-sm">{ach.description}</span>
          {ach.impact && (
            <p className="mt-0.5 text-xs italic text-muted-foreground">
              {ach.impact}
            </p>
          )}
          {ach.skill_tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {ach.skill_tags.map((t) => (
                <span
                  key={t.skill_ref_id}
                  className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                >
                  {t.skill_ref.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={openForm}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Éditer"
          >
            <Pencil className="size-3" />
          </button>
        </div>
      </div>

      {open && (
        <div className="mx-6 mb-2 mt-1 space-y-3 rounded-lg border border-border/60 bg-muted/10 p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`ach-desc-${ach.id}`} className="text-xs">
              Réalisation
            </Label>
            <textarea
              id={`ach-desc-${ach.id}`}
              rows={2}
              value={form.description}
              onChange={(e) =>
                setForm((p) => ({ ...p, description: e.target.value }))
              }
              className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`ach-impact-${ach.id}`} className="text-xs">
              Impact{" "}
              <span className="font-normal text-muted-foreground">
                (optionnel)
              </span>
            </Label>
            <Input
              id={`ach-impact-${ach.id}`}
              value={form.impact}
              onChange={(e) =>
                setForm((p) => ({ ...p, impact: e.target.value }))
              }
              placeholder="ex: −40% temps de déploiement"
            />
          </div>
          <div className="space-y-1.5">
            <SkillChipPicker
              skillUsages={skillUsages}
              checkedIds={checkedIds}
              onToggle={(id) =>
                setCheckedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
            />
            <AchievementSkillAdder
              expId={expId}
              skillUsages={skillUsages}
              candidateSkills={candidateSkills}
              onSkillAddedToBouquet={onSkillAddedToBouquet}
              onAdd={(skillRefId) =>
                setCheckedIds((prev) => {
                  const next = new Set(prev);
                  next.add(skillRefId);
                  return next;
                })
              }
            />
          </div>
          {(saveOp.error ?? deleteOp.error) && (
            <p className="text-xs text-destructive">
              {saveOp.error ?? deleteOp.error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteOp.saving}
              className="mr-auto text-xs text-destructive hover:underline disabled:opacity-50"
            >
              {deleteOp.saving ? "…" : "Supprimer"}
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-7 text-xs"
            >
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveOp.saving || !form.description.trim()}
              className="h-7 text-xs"
            >
              {saveOp.saving ? "…" : "Sauvegarder"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddAchievementRow({
  expId,
  skillUsages,
  candidateSkills,
  onAdded,
  onSkillAddedToBouquet,
}: {
  expId: string;
  skillUsages: ExperienceSkillUsage[];
  candidateSkills: Skill[];
  onAdded: (ach: Achievement) => void;
  onSkillAddedToBouquet: (usage: ExperienceSkillUsage) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AchForm>({ description: "", impact: "" });
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const op = useAsyncOp("Erreur lors de la création");

  async function handleAdd() {
    await op.run(async () => {
      const created = await api.post<Achievement>(
        `/candidates/me/experiences/${expId}/achievements`,
        { description: form.description, impact: form.impact || null },
      );
      await Promise.all(
        [...checkedIds].map((id) =>
          api.post(
            `/candidates/me/experiences/${expId}/achievements/${created.id}/skill-tags`,
            { skill_ref_id: id },
          ),
        ),
      );
      const newTags: AchievementSkillTag[] = skillUsages
        .filter((u) => checkedIds.has(u.skill_ref_id))
        .map((u) => ({
          skill_ref_id: u.skill_ref_id,
          skill_ref: u.skill_ref,
          created_at: new Date().toISOString(),
        }));
      onAdded({ ...created, skill_tags: newTags });
      setForm({ description: "", impact: "" });
      setCheckedIds(new Set());
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full rounded-md border border-dashed border-border/60 py-1.5 text-xs text-muted-foreground hover:border-border hover:text-foreground"
      >
        + Ajouter une réalisation
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-border/60 bg-muted/10 p-3">
      <div className="space-y-1.5">
        <Label htmlFor={`new-ach-desc-${expId}`} className="text-xs">
          Réalisation <span className="text-destructive">*</span>
        </Label>
        <textarea
          id={`new-ach-desc-${expId}`}
          rows={2}
          autoFocus
          value={form.description}
          onChange={(e) =>
            setForm((p) => ({ ...p, description: e.target.value }))
          }
          className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="Décrivez la réalisation…"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`new-ach-impact-${expId}`} className="text-xs">
          Impact{" "}
          <span className="font-normal text-muted-foreground">(optionnel)</span>
        </Label>
        <Input
          id={`new-ach-impact-${expId}`}
          value={form.impact}
          onChange={(e) => setForm((p) => ({ ...p, impact: e.target.value }))}
          placeholder="ex: −40% temps de déploiement"
        />
      </div>
      <div className="space-y-1.5">
        <SkillChipPicker
          skillUsages={skillUsages}
          checkedIds={checkedIds}
          onToggle={(id) =>
            setCheckedIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
        />
        <AchievementSkillAdder
          expId={expId}
          skillUsages={skillUsages}
          candidateSkills={candidateSkills}
          onSkillAddedToBouquet={onSkillAddedToBouquet}
          onAdd={(skillRefId) =>
            setCheckedIds((prev) => {
              const next = new Set(prev);
              next.add(skillRefId);
              return next;
            })
          }
        />
      </div>
      {op.error && <p className="text-xs text-destructive">{op.error}</p>}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setOpen(false);
            setForm({ description: "", impact: "" });
            setCheckedIds(new Set());
          }}
          className="h-7 text-xs"
        >
          Annuler
        </Button>
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={op.saving || !form.description.trim()}
          className="h-7 text-xs"
        >
          {op.saving ? "…" : "Ajouter"}
        </Button>
      </div>
    </div>
  );
}

function AddSkillToBouquet({
  expId,
  existingRefIds,
  candidateSkills,
  onAdded,
  onNewSkill,
}: {
  expId: string;
  existingRefIds: Set<string>;
  candidateSkills: Skill[];
  onAdded: (usage: ExperienceSkillUsage) => void;
  onNewSkill?: (skill: Skill) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useSearchableSelect<SkillReference>((q) =>
    api.get<SkillReference[]>(`/skill-references?q=${encodeURIComponent(q)}`),
  );

  const localMatches = candidateSkills.filter(
    (s) =>
      !existingRefIds.has(s.skill_ref_id) &&
      (!search.query ||
        s.skill_ref.name.toLowerCase().includes(search.query.toLowerCase())),
  );

  const localRefIds = new Set(candidateSkills.map((s) => s.skill_ref_id));
  const remoteOnly = search.results.filter(
    (r) => !localRefIds.has(r.id) && !existingRefIds.has(r.id),
  );

  const queryTrim = search.query.trim();
  const allNames = [
    ...localMatches.map((s) => s.skill_ref.name.toLowerCase()),
    ...search.results.map((r) => r.name.toLowerCase()),
  ];
  const showCreate =
    queryTrim.length >= 2 &&
    !search.searching &&
    !allNames.includes(queryTrim.toLowerCase());

  async function addRefToExp(skillRefId: string, isInCandidateSkills: boolean) {
    if (adding) return;
    setAdding(true);
    try {
      if (!isInCandidateSkills) {
        const newSkill = await api.post<Skill>("/candidates/me/skills", {
          skill_ref_id: skillRefId,
        });
        onNewSkill?.(newSkill);
      }
      const usage = await api.post<ExperienceSkillUsage>(
        `/candidates/me/experiences/${expId}/skill-usages`,
        {
          skill_ref_id: skillRefId,
          usage_role: "implementer",
          intensity: "secondary",
        },
      );
      onAdded(usage);
      search.clear();
      setOpen(false);
    } catch {
      // ignore duplicates
    } finally {
      setAdding(false);
    }
  }

  async function createAndAdd() {
    const name = queryTrim;
    if (!name || adding) return;
    setAdding(true);
    try {
      const ref = await api.post<SkillReference>("/skill-references", {
        name,
        kind: "technical",
      });
      const newSkill = await api.post<Skill>("/candidates/me/skills", {
        skill_ref_id: ref.id,
      });
      onNewSkill?.(newSkill);
      const usage = await api.post<ExperienceSkillUsage>(
        `/candidates/me/experiences/${expId}/skill-usages`,
        {
          skill_ref_id: ref.id,
          usage_role: "implementer",
          intensity: "secondary",
        },
      );
      onAdded(usage);
      search.clear();
      setOpen(false);
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="rounded-full border border-dashed border-border/60 px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
      >
        + Ajouter
      </button>
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        onBlur={() =>
          setTimeout(() => {
            setOpen(false);
            search.clear();
          }, 200)
        }
        placeholder="Rechercher ou créer…"
        className="h-6 w-44 rounded-full border border-primary/40 bg-background px-2.5 text-xs outline-none focus:border-primary"
        disabled={adding}
      />
      {(localMatches.length > 0 ||
        remoteOnly.length > 0 ||
        showCreate ||
        search.searching) && (
        <SearchableSelect
          query={search.query}
          searching={search.searching}
          onCreateNew={showCreate ? createAndAdd : undefined}
          dropdownClassName="w-56"
        >
          {localMatches.map((skill) => (
            <button
              key={skill.id}
              type="button"
              onMouseDown={() => addRefToExp(skill.skill_ref_id, true)}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-muted"
            >
              <span>{skill.skill_ref.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {skill.skill_ref.kind}
              </span>
            </button>
          ))}
          {remoteOnly.length > 0 && localMatches.length > 0 && (
            <div className="my-0.5 border-t border-border/50" />
          )}
          {remoteOnly.map((ref) => (
            <button
              key={ref.id}
              type="button"
              onMouseDown={() => addRefToExp(ref.id, false)}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-muted"
            >
              <span>{ref.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {ref.kind}
              </span>
            </button>
          ))}
        </SearchableSelect>
      )}
    </div>
  );
}

function ProposeAchievementAssoc({
  skill,
  achievements,
  expId,
  onDone,
  onTagged,
}: {
  skill: ExperienceSkillUsage;
  achievements: Achievement[];
  expId: string;
  onDone: () => void;
  onTagged: (achId: string, tag: AchievementSkillTag) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  async function handleAssoc() {
    setSaving(true);
    await Promise.allSettled(
      [...selected].map(async (achId) => {
        try {
          await api.post(
            `/candidates/me/experiences/${expId}/achievements/${achId}/skill-tags`,
            { skill_ref_id: skill.skill_ref_id },
          );
          onTagged(achId, {
            skill_ref_id: skill.skill_ref_id,
            skill_ref: skill.skill_ref,
            created_at: new Date().toISOString(),
          });
        } catch {
          // ignore duplicates
        }
      }),
    );
    setSaving(false);
    onDone();
  }

  return (
    <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs">
      <p className="mb-1.5 font-medium text-foreground">
        Associer aussi «{skill.skill_ref.name}» à une réalisation ?
      </p>
      <div className="mb-2 space-y-1">
        {achievements.map((ach) => (
          <label
            key={ach.id}
            className="flex cursor-pointer items-start gap-1.5"
          >
            <input
              type="checkbox"
              className="mt-0.5 h-3 w-3 accent-primary"
              checked={selected.has(ach.id)}
              onChange={(e) => {
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(ach.id);
                  else next.delete(ach.id);
                  return next;
                });
              }}
            />
            <span className="line-clamp-1 text-muted-foreground">
              {ach.description}
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleAssoc}
          disabled={saving || selected.size === 0}
          className="rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "…" : "Associer"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}

function AchievementSkillAdder({
  expId,
  skillUsages,
  candidateSkills,
  onSkillAddedToBouquet,
  onAdd,
}: {
  expId: string;
  skillUsages: ExperienceSkillUsage[];
  candidateSkills: Skill[];
  onSkillAddedToBouquet: (usage: ExperienceSkillUsage) => void;
  onAdd: (skillRefId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useSearchableSelect<SkillReference>((q) =>
    api.get<SkillReference[]>(`/skill-references?q=${encodeURIComponent(q)}`),
  );

  const bouquetRefIds = new Set(skillUsages.map((u) => u.skill_ref_id));
  const localRefIds = new Set(candidateSkills.map((s) => s.skill_ref_id));

  const bouquetMatches = skillUsages.filter(
    (u) =>
      !search.query ||
      u.skill_ref.name.toLowerCase().includes(search.query.toLowerCase()),
  );
  const localNotInBouquet = candidateSkills.filter(
    (s) =>
      !bouquetRefIds.has(s.skill_ref_id) &&
      (!search.query ||
        s.skill_ref.name.toLowerCase().includes(search.query.toLowerCase())),
  );
  const remoteOnly = search.results.filter(
    (r) => !localRefIds.has(r.id) && !bouquetRefIds.has(r.id),
  );

  const queryTrim = search.query.trim();
  const allNames = [
    ...bouquetMatches.map((u) => u.skill_ref.name.toLowerCase()),
    ...localNotInBouquet.map((s) => s.skill_ref.name.toLowerCase()),
    ...search.results.map((r) => r.name.toLowerCase()),
  ];
  const showCreate =
    queryTrim.length >= 2 &&
    !search.searching &&
    !allNames.includes(queryTrim.toLowerCase());

  async function addToAch(
    skillRefId: string,
    isInCandidateSkills: boolean,
    isInBouquet: boolean,
  ) {
    if (adding) return;
    setAdding(true);
    try {
      if (!isInCandidateSkills) {
        await api.post<Skill>("/candidates/me/skills", {
          skill_ref_id: skillRefId,
        });
      }
      if (!isInBouquet) {
        const usage = await api.post<ExperienceSkillUsage>(
          `/candidates/me/experiences/${expId}/skill-usages`,
          {
            skill_ref_id: skillRefId,
            usage_role: "implementer",
            intensity: "secondary",
          },
        );
        onSkillAddedToBouquet(usage);
      }
      onAdd(skillRefId);
      search.clear();
      setOpen(false);
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  }

  async function createAndAddToAch() {
    const name = queryTrim;
    if (!name || adding) return;
    setAdding(true);
    try {
      const ref = await api.post<SkillReference>("/skill-references", {
        name,
        kind: "technical",
      });
      await api.post<Skill>("/candidates/me/skills", { skill_ref_id: ref.id });
      const usage = await api.post<ExperienceSkillUsage>(
        `/candidates/me/experiences/${expId}/skill-usages`,
        {
          skill_ref_id: ref.id,
          usage_role: "implementer",
          intensity: "secondary",
        },
      );
      onSkillAddedToBouquet(usage);
      onAdd(ref.id);
      search.clear();
      setOpen(false);
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
      >
        + ajouter une compétence
      </button>
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        onBlur={() =>
          setTimeout(() => {
            setOpen(false);
            search.clear();
          }, 200)
        }
        placeholder="Rechercher ou créer…"
        className="h-6 w-48 rounded-full border border-primary/40 bg-background px-2.5 text-xs outline-none focus:border-primary"
        disabled={adding}
      />
      {(bouquetMatches.length > 0 ||
        localNotInBouquet.length > 0 ||
        remoteOnly.length > 0 ||
        showCreate ||
        search.searching) && (
        <SearchableSelect
          query={search.query}
          searching={search.searching}
          onCreateNew={showCreate ? createAndAddToAch : undefined}
          dropdownClassName="w-60"
        >
          {bouquetMatches.length > 0 && (
            <>
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Dans cette expérience
              </p>
              {bouquetMatches.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onMouseDown={() => addToAch(u.skill_ref_id, true, true)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-muted"
                >
                  <span>{u.skill_ref.name}</span>
                </button>
              ))}
            </>
          )}
          {localNotInBouquet.length > 0 && (
            <>
              {bouquetMatches.length > 0 && (
                <div className="my-0.5 border-t border-border/50" />
              )}
              {localNotInBouquet.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onMouseDown={() => addToAch(skill.skill_ref_id, true, false)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-muted"
                >
                  <span>{skill.skill_ref.name}</span>
                  <span className="text-[10px] text-amber-500">+ bouquet</span>
                </button>
              ))}
            </>
          )}
          {remoteOnly.length > 0 && (
            <>
              {(bouquetMatches.length > 0 || localNotInBouquet.length > 0) && (
                <div className="my-0.5 border-t border-border/50" />
              )}
              {remoteOnly.map((ref) => (
                <button
                  key={ref.id}
                  type="button"
                  onMouseDown={() => addToAch(ref.id, false, false)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-muted"
                >
                  <span>{ref.name}</span>
                  <span className="text-[10px] text-amber-500">+ bouquet</span>
                </button>
              ))}
            </>
          )}
        </SearchableSelect>
      )}
    </div>
  );
}

function ExperienceCard({
  exp,
  candidateSkills,
  onUpdated,
  onDeleted,
  onNewSkill,
}: {
  exp: Experience;
  candidateSkills: Skill[];
  onUpdated: (updated: Experience) => void;
  onDeleted: (id: string) => void;
  onNewSkill?: (skill: Skill) => void;
}) {
  const [editingExp, setEditingExp] = useState(false);
  const [form, setForm] = useState<ExpForm>(expToForm(exp));
  const op = useAsyncOp("Erreur lors de la sauvegarde");
  const [achievements, setAchievements] = useState<Achievement[]>(
    exp.achievements,
  );
  const [skillUsages, setSkillUsages] = useState<ExperienceSkillUsage[]>(
    exp.skill_usages,
  );
  const [pendingAssocSkill, setPendingAssocSkill] =
    useState<ExperienceSkillUsage | null>(null);

  function set<K extends keyof ExpForm>(k: K, v: ExpForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleRemoveSkillUsage(usage: ExperienceSkillUsage) {
    try {
      await api.delete(
        `/candidates/me/experiences/${exp.id}/skill-usages/${usage.id}`,
      );
      setSkillUsages((prev) => prev.filter((u) => u.id !== usage.id));
    } catch {
      // ignore
    }
  }

  async function handleSaveExp(e: React.FormEvent) {
    e.preventDefault();
    await op.run(async () => {
      const updated = await api.put<Experience>(
        `/candidates/me/experiences/${exp.id}`,
        {
          client_name: form.client_name,
          role: form.role,
          start_date: form.start_date,
          end_date: form.is_current ? null : form.end_date || null,
          is_current: form.is_current,
          description: form.description || null,
          context: form.context || null,
        },
      );
      onUpdated({ ...updated, achievements, skill_usages: skillUsages });
      setEditingExp(false);
    });
  }

  async function handleDeleteExp() {
    await op.run(async () => {
      await api.delete(`/candidates/me/experiences/${exp.id}`);
      onDeleted(exp.id);
    });
  }

  const dates = exp.is_current
    ? `${exp.start_date} → présent`
    : `${exp.start_date}${exp.end_date ? ` → ${exp.end_date}` : ""}`;

  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <div className="flex items-start justify-between gap-4 border-b border-border/40 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {exp.client_name} — {exp.role}
          </p>
          <p className="text-xs text-muted-foreground">{dates}</p>
          {exp.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {exp.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => {
              setEditingExp(!editingExp);
              setForm(expToForm(exp));
            }}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Éditer l'expérience"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDeleteExp}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
            title="Supprimer"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {editingExp && (
        <form
          onSubmit={handleSaveExp}
          className="space-y-3 border-b border-border/40 bg-muted/10 px-4 py-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor={`exp-client-${exp.id}`} className="text-xs">
                Client *
              </Label>
              <Input
                id={`exp-client-${exp.id}`}
                value={form.client_name}
                onChange={(e) => set("client_name", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`exp-role-${exp.id}`} className="text-xs">
                Rôle *
              </Label>
              <Input
                id={`exp-role-${exp.id}`}
                value={form.role}
                onChange={(e) => set("role", e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor={`exp-start-${exp.id}`} className="text-xs">
                Date début *
              </Label>
              <Input
                id={`exp-start-${exp.id}`}
                type="date"
                value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`exp-end-${exp.id}`} className="text-xs">
                Date fin
              </Label>
              <Input
                id={`exp-end-${exp.id}`}
                type="date"
                value={form.end_date}
                onChange={(e) => set("end_date", e.target.value)}
                disabled={form.is_current}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              id={`exp-current-${exp.id}`}
              type="checkbox"
              checked={form.is_current}
              onChange={(e) => {
                set("is_current", e.target.checked);
                if (e.target.checked) set("end_date", "");
              }}
              className="h-4 w-4 cursor-pointer accent-primary"
            />
            <Label
              htmlFor={`exp-current-${exp.id}`}
              className="cursor-pointer font-normal text-xs"
            >
              Poste actuel
            </Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`exp-desc-${exp.id}`} className="text-xs">
              Description
            </Label>
            <Textarea
              id={`exp-desc-${exp.id}`}
              value={form.description}
              onChange={(v) => set("description", v)}
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`exp-context-${exp.id}`} className="text-xs">
              Contexte
            </Label>
            <Textarea
              id={`exp-context-${exp.id}`}
              value={form.context}
              onChange={(v) => set("context", v)}
              rows={2}
              placeholder="Contexte de la mission, secteur, équipe…"
            />
          </div>
          {op.error && <p className="text-xs text-destructive">{op.error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setEditingExp(false)}
              className="h-7 text-xs"
            >
              Annuler
            </Button>
            <Button
              size="sm"
              type="submit"
              disabled={op.saving}
              className="h-7 text-xs"
            >
              {op.saving ? "…" : "Sauvegarder"}
            </Button>
          </div>
        </form>
      )}

      {/* Compétences utilisées — always visible */}
      <div className="border-b border-border/40 px-4 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Compétences utilisées
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {skillUsages.map((u) => (
            <span
              key={u.id}
              className="group flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2.5 py-0.5 text-xs text-muted-foreground"
            >
              {u.skill_ref.name}
              <button
                type="button"
                onClick={() => handleRemoveSkillUsage(u)}
                className="ml-0.5 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                aria-label={`Supprimer ${u.skill_ref.name}`}
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
          <AddSkillToBouquet
            expId={exp.id}
            existingRefIds={new Set(skillUsages.map((u) => u.skill_ref_id))}
            candidateSkills={candidateSkills}
            onAdded={(usage) => {
              setSkillUsages((prev) => [...prev, usage]);
              if (achievements.length > 0) setPendingAssocSkill(usage);
            }}
            onNewSkill={onNewSkill}
          />
        </div>
        {pendingAssocSkill && achievements.length > 0 && (
          <ProposeAchievementAssoc
            skill={pendingAssocSkill}
            achievements={achievements}
            expId={exp.id}
            onDone={() => setPendingAssocSkill(null)}
            onTagged={(achId, tag) =>
              setAchievements((prev) =>
                prev.map((a) =>
                  a.id === achId
                    ? { ...a, skill_tags: [...a.skill_tags, tag] }
                    : a,
                ),
              )
            }
          />
        )}
      </div>

      <div className="px-4 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Réalisations
        </p>
        {achievements.map((ach) => (
          <AchievementRow
            key={ach.id}
            ach={ach}
            skillUsages={skillUsages}
            candidateSkills={candidateSkills}
            expId={exp.id}
            onSaved={(updated) =>
              setAchievements((prev) =>
                prev.map((a) => (a.id === updated.id ? updated : a)),
              )
            }
            onDeleted={(id) =>
              setAchievements((prev) => prev.filter((a) => a.id !== id))
            }
            onSkillAddedToBouquet={(usage) =>
              setSkillUsages((prev) => [...prev, usage])
            }
          />
        ))}
        <AddAchievementRow
          expId={exp.id}
          skillUsages={skillUsages}
          candidateSkills={candidateSkills}
          onAdded={(ach) => setAchievements((prev) => [...prev, ach])}
          onSkillAddedToBouquet={(usage) =>
            setSkillUsages((prev) => [...prev, usage])
          }
        />
      </div>
    </div>
  );
}

export function ExperienceSection() {
  const [items, setItems] = useState<Experience[]>([]);
  const [candidateSkills, setCandidateSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<ExpForm>(EMPTY_EXP);
  const op = useAsyncOp("Erreur lors de la création");

  useEffect(() => {
    Promise.all([
      api.get<Experience[]>("/candidates/me/experiences"),
      api.get<Skill[]>("/candidates/me/skills"),
    ])
      .then(([exps, skills]) => {
        setItems(exps);
        setCandidateSkills(skills);
      })
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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await op.run(async () => {
      const created = await api.post<Experience>("/candidates/me/experiences", {
        client_name: form.client_name,
        role: form.role,
        start_date: form.start_date,
        end_date: form.is_current ? null : form.end_date || null,
        is_current: form.is_current,
        description: form.description || null,
        context: form.context || null,
      });
      setItems((prev) => [...prev, created]);
      setForm(EMPTY_EXP);
      setAdding(false);
    });
  }

  if (loading)
    return <div className="h-24 animate-pulse rounded-xl bg-muted" />;
  if (fetchError)
    return <p className="text-sm text-destructive">{fetchError}</p>;

  return (
    <div className="space-y-3">
      {items.map((exp) => (
        <ExperienceCard
          key={exp.id}
          exp={exp}
          candidateSkills={candidateSkills}
          onUpdated={(updated) =>
            setItems((prev) =>
              prev.map((i) => (i.id === updated.id ? updated : i)),
            )
          }
          onDeleted={(id) =>
            setItems((prev) => prev.filter((i) => i.id !== id))
          }
          onNewSkill={(skill) => setCandidateSkills((prev) => [...prev, skill])}
        />
      ))}

      {adding ? (
        <form
          onSubmit={handleAdd}
          className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-exp-client">Client *</Label>
              <Input
                id="new-exp-client"
                value={form.client_name}
                onChange={(e) => set("client_name", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-exp-role">Rôle *</Label>
              <Input
                id="new-exp-role"
                value={form.role}
                onChange={(e) => set("role", e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-exp-start">Date début *</Label>
              <Input
                id="new-exp-start"
                type="date"
                value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-exp-end">Date fin</Label>
              <Input
                id="new-exp-end"
                type="date"
                value={form.end_date}
                onChange={(e) => set("end_date", e.target.value)}
                disabled={form.is_current}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="new-exp-current"
              type="checkbox"
              checked={form.is_current}
              onChange={(e) => {
                set("is_current", e.target.checked);
                if (e.target.checked) set("end_date", "");
              }}
              className="h-4 w-4 cursor-pointer accent-primary"
            />
            <Label
              htmlFor="new-exp-current"
              className="cursor-pointer font-normal"
            >
              Poste actuel
            </Label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-exp-desc">Description</Label>
            <Textarea
              id="new-exp-desc"
              value={form.description}
              onChange={(v) => set("description", v)}
              rows={2}
            />
          </div>
          {op.error && <p className="text-sm text-destructive">{op.error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                setAdding(false);
                setForm(EMPTY_EXP);
              }}
            >
              Annuler
            </Button>
            <Button size="sm" type="submit" disabled={op.saving}>
              {op.saving ? "…" : "Créer"}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAdding(true)}
          className="gap-1.5"
        >
          <Plus className="size-3.5" />
          Ajouter une expérience
        </Button>
      )}
    </div>
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

      {/* ---- 3×2 grid per kind ---- */}
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

            {/* Kind selector — custom skills only */}
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
                          usage_role: "implementer" as const,
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

export function EducationSection() {
  const crud = useCrudSection<Education, EduForm>({
    endpoint: "/candidates/me/education",
    emptyForm: EMPTY_EDU,
    toForm: eduToForm,
    toBody: (f) => ({
      school: f.school,
      degree: f.degree || null,
      field_of_study: f.field_of_study || null,
      start_date: f.start_date || null,
      end_date: f.end_date || null,
      description: f.description || null,
    }),
    fetchErrorMsg: "Impossible de charger les formations",
  });
  const {
    items,
    form,
    saving,
    error,
    adding,
    editingId,
    loading,
    fetchError,
    setField,
    startEdit,
    startAdd,
    cancelForm,
    handleSubmit,
    handleDelete,
  } = crud;

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
          onChange={(e) => setField("school", e.target.value)}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="edu-degree">Diplôme</Label>
          <Input
            id="edu-degree"
            value={form.degree}
            onChange={(e) => setField("degree", e.target.value)}
            placeholder="ex: Master, Licence…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edu-field">{"Domaine d'études"}</Label>
          <Input
            id="edu-field"
            value={form.field_of_study}
            onChange={(e) => setField("field_of_study", e.target.value)}
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
            onChange={(e) => setField("start_date", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edu-end">Date fin</Label>
          <Input
            id="edu-end"
            type="date"
            value={form.end_date}
            onChange={(e) => setField("end_date", e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edu-desc">Description</Label>
        <Textarea
          id="edu-desc"
          value={form.description}
          onChange={(v) => setField("description", v)}
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
            if (adding || editingId) {
              cancelForm();
            } else {
              startAdd();
            }
          }}
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <div className="h-16 animate-pulse rounded-lg bg-muted" />}
        {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}
        {!loading && !fetchError && items.length === 0 && !adding && (
          <EmptyState
            message="Aucune formation ajoutee."
            description="Ajoutez les diplomes ou parcours qui renforcent la lecture de votre dossier."
            className="px-4 py-4"
          />
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

export function CertificationSection() {
  const crud = useCrudSection<Certification, CertForm>({
    endpoint: "/candidates/me/certifications",
    emptyForm: EMPTY_CERT,
    toForm: certToForm,
    toBody: (f) => ({
      name: f.name,
      issuer: f.issuer,
      issue_date: f.issue_date,
      expiry_date: f.expiry_date || null,
      credential_url: f.credential_url || null,
    }),
    fetchErrorMsg: "Impossible de charger les certifications",
  });
  const {
    items,
    form,
    saving,
    error,
    adding,
    editingId,
    loading,
    fetchError,
    setField,
    startEdit,
    startAdd,
    cancelForm,
    handleSubmit,
    handleDelete,
  } = crud;

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
            onChange={(e) => setField("name", e.target.value)}
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
            onChange={(e) => setField("issuer", e.target.value)}
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
            onChange={(e) => setField("issue_date", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cert-expiry">{"Date d'expiration"}</Label>
          <Input
            id="cert-expiry"
            type="date"
            value={form.expiry_date}
            onChange={(e) => setField("expiry_date", e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cert-url">URL du certificat</Label>
        <Input
          id="cert-url"
          type="url"
          value={form.credential_url}
          onChange={(e) => setField("credential_url", e.target.value)}
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
            if (adding || editingId) {
              cancelForm();
            } else {
              startAdd();
            }
          }}
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <div className="h-16 animate-pulse rounded-lg bg-muted" />}
        {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}
        {!loading && !fetchError && items.length === 0 && !adding && (
          <EmptyState
            message="Aucune certification ajoutee."
            description="Les certifications servent de preuves complémentaires dans les dossiers générés."
            className="px-4 py-4"
          />
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

export function LanguageSection() {
  const crud = useCrudSection<Language, LangForm>({
    endpoint: "/candidates/me/languages",
    emptyForm: EMPTY_LANG,
    toForm: (lang) => ({ name: lang.name, level: lang.level }),
    toBody: (f) => ({ name: f.name, level: f.level }),
    fetchErrorMsg: "Impossible de charger les langues",
  });
  const {
    items,
    form,
    setForm,
    saving,
    error,
    adding,
    editingId,
    loading,
    fetchError,
    startEdit,
    startAdd,
    handleSubmit,
    handleDelete,
  } = crud;
  const [languageRefs, setLanguageRefs] = useState<LanguageReference[]>([]);
  const [searchingRefs, setSearchingRefs] = useState(false);

  useEffect(() => {
    const query = form.name.trim();
    if (query.length < 2) {
      setLanguageRefs([]);
      setSearchingRefs(false);
      return;
    }

    setSearchingRefs(true);
    const timer = setTimeout(async () => {
      try {
        const results = await api.get<LanguageReference[]>(
          `/candidates/language-references?q=${encodeURIComponent(query)}`,
        );
        setLanguageRefs(results.filter((ref) => ref.name !== form.name));
      } catch {
        setLanguageRefs([]);
      } finally {
        setSearchingRefs(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [form.name]);

  function cancelForm() {
    crud.cancelForm();
    setLanguageRefs([]);
  }

  function selectLanguageRef(ref: LanguageReference) {
    setForm((prev) => ({ ...prev, name: ref.name }));
    setLanguageRefs([]);
  }

  const inlineForm = (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="relative space-y-1.5">
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
          {(languageRefs.length > 0 || searchingRefs) && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-popover shadow-md">
              {languageRefs.map((ref) => (
                <button
                  key={ref.id}
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => selectLanguageRef(ref)}
                >
                  <span className="font-medium">{ref.name}</span>
                  {ref.aliases.length > 0 && (
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {ref.aliases.slice(0, 3).join(", ")}
                    </span>
                  )}
                </button>
              ))}
              {searchingRefs && languageRefs.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Recherche...
                </div>
              )}
            </div>
          )}
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
    <Card className="overflow-visible">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Langues</CardTitle>
        <SectionAddButton
          adding={adding && !editingId}
          onToggle={() => {
            if (adding || editingId) {
              cancelForm();
            } else {
              startAdd();
            }
          }}
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <div className="h-16 animate-pulse rounded-lg bg-muted" />}
        {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}
        {!loading && !fetchError && items.length === 0 && !adding && (
          <EmptyState
            message="Aucune langue ajoutee."
            description="Ajoutez les langues utiles pour les missions et les dossiers presentes aux recruteurs."
            className="px-4 py-4"
          />
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
