"use client";

import { Input } from "@/components/ui/input";
import { SkillChip } from "@/components/ui/SkillChip";
import { api } from "@/lib/api";
import { useSearchableSelect } from "@/lib/hooks/useSearchableSelect";
import type { SkillReference } from "@/types/api";

export type SelectedSkill = { skill_ref_id: string; name: string };

interface SkillPickerProps {
  id?: string;
  selected: SelectedSkill[];
  onAdd: (skill: SkillReference) => void;
  onRemove: (refId: string) => void;
  placeholder?: string;
}

/** Recherche dans le référentiel public + sélection en chips. */
export function SkillPicker({
  id,
  selected,
  onAdd,
  onRemove,
  placeholder = "Rechercher une compétence…",
}: SkillPickerProps) {
  const search = useSearchableSelect<SkillReference>((q) =>
    api.get<SkillReference[]>(
      `/skill-references/public?q=${encodeURIComponent(q)}`,
    ),
  );

  return (
    <div className="space-y-1.5">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <SkillChip
              key={s.skill_ref_id}
              label={s.name}
              onRemove={() => onRemove(s.skill_ref_id)}
            />
          ))}
        </div>
      )}
      <div className="relative">
        <Input
          id={id}
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
        {search.results.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-line bg-surface py-1 shadow-md">
            {search.results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(r);
                    search.clear();
                  }}
                  className="flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-paper-2"
                >
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
