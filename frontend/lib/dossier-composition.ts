// Pure composition logic for the adapted-dossier editor.
//
// Mirrors backend decision #1: an axis with no selections includes every pool
// item in default order (a live "all"); an axis with selections is curated, so
// selected items come first in their saved order and the rest are excluded.

export interface CompositionRow {
  id: string;
  included: boolean;
  featured: boolean;
}

interface SelectionInput {
  id: string;
  position: number;
  is_featured: boolean;
}

export function buildRows(
  poolIds: string[],
  selections: SelectionInput[],
): CompositionRow[] {
  if (selections.length === 0) {
    return poolIds.map((id) => ({ id, included: true, featured: false }));
  }
  const pool = new Set(poolIds);
  const selected = new Set<string>();
  const rows: CompositionRow[] = [];
  for (const sel of [...selections].sort((a, b) => a.position - b.position)) {
    if (!pool.has(sel.id)) continue;
    selected.add(sel.id);
    rows.push({ id: sel.id, included: true, featured: sel.is_featured });
  }
  for (const id of poolIds) {
    if (!selected.has(id)) rows.push({ id, included: false, featured: false });
  }
  return rows;
}

export function reorder<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function toSelectionPayload<K extends string>(
  rows: CompositionRow[],
  idKey: K,
): Array<{ is_featured: boolean } & Record<K, string>>;
export function toSelectionPayload(
  rows: CompositionRow[],
  idKey: string,
): Array<Record<string, string | boolean>> {
  return rows
    .filter((row) => row.included)
    .map((row) => ({ [idKey]: row.id, is_featured: row.featured }));
}
