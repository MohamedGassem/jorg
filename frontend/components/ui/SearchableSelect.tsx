"use client";

import { Plus } from "lucide-react";

interface SearchableSelectProps {
  query: string;
  searching: boolean;
  onCreateNew?: () => void;
  dropdownClassName?: string;
  children: React.ReactNode;
}

export function SearchableSelect({
  query,
  searching,
  onCreateNew,
  dropdownClassName = "w-56",
  children,
}: SearchableSelectProps) {
  const queryTrim = query.trim();
  const showCreate = !!onCreateNew;

  return (
    <div
      className={`absolute left-0 top-7 z-20 rounded-lg border border-border bg-popover shadow-lg max-h-52 overflow-y-auto ${dropdownClassName}`}
    >
      {children}
      {searching && (
        <p className="px-3 py-1.5 text-xs text-muted-foreground">Recherche…</p>
      )}
      {showCreate && (
        <button
          type="button"
          onMouseDown={onCreateNew}
          className="flex w-full items-center gap-1.5 border-t border-border px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3 shrink-0" />
          Créer «{" "}
          <span className="font-medium text-foreground">{queryTrim}</span>»
        </button>
      )}
    </div>
  );
}
