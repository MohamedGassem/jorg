// frontend/components/candidate/SkillContextualizationDialog.tsx
"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import type { Experience, Skill } from "@/types/api";

export function SkillContextualizationDialog({
  skill,
  allSkills,
  initialIndex,
  experiences,
  onClose,
  onAssociated,
}: {
  skill: Skill;
  allSkills?: Skill[];
  initialIndex?: number;
  experiences: Experience[];
  onClose: () => void;
  onAssociated?: (associatedExpIds: string[], skill: Skill) => void;
}) {
  const skills = allSkills ?? [skill];
  const [currentIdx, setCurrentIdx] = useState(initialIndex ?? 0);
  const currentSkill = skills[currentIdx] ?? skill;

  const [selections, setSelections] = useState<
    Record<string, { exp: boolean; achs: Set<string> }>
  >({});
  const [saving, setSaving] = useState(false);

  function goTo(idx: number) {
    setCurrentIdx(idx);
    setSelections({});
  }

  function toggleExp(expId: string) {
    setSelections((prev) => ({
      ...prev,
      [expId]: {
        exp: !prev[expId]?.exp,
        achs: prev[expId]?.achs ?? new Set<string>(),
      },
    }));
  }

  function toggleAch(expId: string, achId: string) {
    setSelections((prev) => {
      const cur = prev[expId] ?? { exp: false, achs: new Set<string>() };
      const achs = new Set(cur.achs);
      if (achs.has(achId)) achs.delete(achId);
      else achs.add(achId);
      return { ...prev, [expId]: { exp: cur.exp || achs.size > 0, achs } };
    });
  }

  async function handleAssociate() {
    setSaving(true);

    // Build work items for selected experiences
    const entries = Object.entries(selections).filter(([, sel]) => sel.exp);

    // Fire all skill-usage POSTs in parallel
    const usageResults = await Promise.allSettled(
      entries.map(([expId]) =>
        api
          .post(`/candidates/me/experiences/${expId}/skill-usages`, {
            skill_ref_id: currentSkill.skill_ref_id,
            usage_role: "implementer",
            intensity: "secondary",
          })
          .then(() => expId),
      ),
    );

    // Collect only the expIds whose POST succeeded
    const associatedExpIds: string[] = usageResults
      .filter(
        (r): r is PromiseFulfilledResult<string> => r.status === "fulfilled",
      )
      .map((r) => r.value);

    // Fire all achievement-tag POSTs in parallel (one batch across all exps)
    const achRequests: Promise<unknown>[] = [];
    for (const [expId, sel] of entries) {
      for (const achId of sel.achs) {
        achRequests.push(
          api
            .post(
              `/candidates/me/experiences/${expId}/achievements/${achId}/skill-tags`,
              { skill_ref_id: currentSkill.skill_ref_id },
            )
            .catch(() => {
              // ignore individual failures
            }),
        );
      }
    }
    await Promise.allSettled(achRequests);

    setSaving(false);
    onAssociated?.(associatedExpIds, currentSkill);
    if (currentIdx < skills.length - 1) {
      goTo(currentIdx + 1);
    } else {
      onClose();
    }
  }

  const hasSelection = Object.values(selections).some(
    (s) => s.exp || s.achs.size > 0,
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            {skills.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goTo(currentIdx - 1)}
                  disabled={currentIdx === 0}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  aria-label="Compétence précédente"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {currentIdx + 1}/{skills.length}
                </span>
                <button
                  type="button"
                  onClick={() => goTo(currentIdx + 1)}
                  disabled={currentIdx === skills.length - 1}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  aria-label="Compétence suivante"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
            <DialogTitle className="leading-snug">
              Où as-tu utilisé «{currentSkill.skill_ref.name}» ?
            </DialogTitle>
          </div>
        </DialogHeader>
        <div className="max-h-80 space-y-2 overflow-y-auto py-1">
          {experiences.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aucune expérience pour le moment.
            </p>
          )}
          {experiences.map((exp) => {
            const sel = selections[exp.id] ?? {
              exp: false,
              achs: new Set<string>(),
            };
            return (
              <div
                key={exp.id}
                className="rounded-lg border border-border/60 p-3"
              >
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={sel.exp}
                    onChange={() => toggleExp(exp.id)}
                  />
                  <span className="text-sm font-medium">
                    {exp.client_name} - {exp.role}
                  </span>
                </label>
                {exp.achievements.length > 0 && sel.exp && (
                  <div className="ml-6 mt-2 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Réalisations
                    </p>
                    {exp.achievements.map((ach) => (
                      <label
                        key={ach.id}
                        className="flex cursor-pointer items-start gap-1.5"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-3.5 w-3.5 accent-primary"
                          checked={sel.achs.has(ach.id)}
                          onChange={() => toggleAch(exp.id, ach.id)}
                        />
                        <span className="line-clamp-2 text-xs text-muted-foreground">
                          {ach.description}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Associer plus tard
          </button>
          <Button
            size="sm"
            onClick={handleAssociate}
            disabled={saving || !hasSelection}
          >
            {saving ? "Association…" : "Associer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
