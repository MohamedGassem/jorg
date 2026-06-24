import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTemplateChoices } from "@/lib/hooks/useTemplateChoices";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

import { api } from "@/lib/api";

const builtins = [{ key: "compact_esn", name: "Compact", description: "x" }];
const orgList = [
  { id: "t1", name: "Valid", is_valid: true, status: "active" },
  { id: "t2", name: "Draft", is_valid: true, status: "draft" },
  { id: "t3", name: "Invalid", is_valid: false, status: "active" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useTemplateChoices", () => {
  it("does not fetch while closed", () => {
    renderHook(() => useTemplateChoices(false, null));
    expect(api.get).not.toHaveBeenCalled();
  });

  it("loads builtin templates when opened (no org)", async () => {
    vi.mocked(api.get).mockResolvedValue(builtins);
    const { result } = renderHook(() => useTemplateChoices(true, null));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.builtinTemplates).toEqual(builtins);
    expect(result.current.orgTemplates).toEqual([]);
    expect(api.get).toHaveBeenCalledWith("/templates/builtin");
    expect(api.get).not.toHaveBeenCalledWith("/organizations/org1/templates");
  });

  it("loads and filters org templates to valid+active when an org is given", async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === "/templates/builtin"
        ? Promise.resolve(builtins)
        : Promise.resolve(orgList),
    );
    const { result } = renderHook(() => useTemplateChoices(true, "org1"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.orgTemplates.map((t) => t.id)).toEqual(["t1"]);
  });

  it("reports a load error without throwing", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useTemplateChoices(true, null));
    await waitFor(() => expect(result.current.loadError).not.toBeNull());
    expect(result.current.loaded).toBe(false);
  });
});
