import { describe, expect, it } from "vitest";
import {
  buildRows,
  reorder,
  toSelectionPayload,
  type CompositionRow,
} from "@/lib/dossier-composition";

describe("buildRows", () => {
  it("includes all pool items in pool order when there are no selections", () => {
    const rows = buildRows(["a", "b", "c"], []);
    expect(rows).toEqual([
      { id: "a", included: true, featured: false },
      { id: "b", included: true, featured: false },
      { id: "c", included: true, featured: false },
    ]);
  });

  it("places selected items first in selection order, carrying featured", () => {
    const rows = buildRows(
      ["a", "b", "c"],
      [
        { id: "c", position: 0, is_featured: true },
        { id: "a", position: 1, is_featured: false },
      ],
    );
    expect(rows).toEqual([
      { id: "c", included: true, featured: true },
      { id: "a", included: true, featured: false },
      { id: "b", included: false, featured: false },
    ]);
  });

  it("ignores selections referencing ids absent from the pool (defensive)", () => {
    const rows = buildRows(
      ["a", "b"],
      [
        { id: "ghost", position: 0, is_featured: true },
        { id: "b", position: 1, is_featured: false },
      ],
    );
    expect(rows).toEqual([
      { id: "b", included: true, featured: false },
      { id: "a", included: false, featured: false },
    ]);
  });
});

describe("reorder", () => {
  it("moves a row from one index to another preserving the rest", () => {
    const rows: CompositionRow[] = [
      { id: "a", included: true, featured: false },
      { id: "b", included: true, featured: false },
      { id: "c", included: true, featured: false },
    ];
    expect(reorder(rows, 0, 2).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });
});

describe("toSelectionPayload", () => {
  it("keeps only included rows, in order, mapping id via the given key", () => {
    const rows: CompositionRow[] = [
      { id: "c", included: true, featured: true },
      { id: "a", included: false, featured: false },
      { id: "b", included: true, featured: false },
    ];
    expect(toSelectionPayload(rows, "experience_id")).toEqual([
      { experience_id: "c", is_featured: true },
      { experience_id: "b", is_featured: false },
    ]);
  });
});
