import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/safe-path";

describe("safeInternalPath", () => {
  it("returns an allowed internal path unchanged", () => {
    expect(safeInternalPath("/invitation/abc123")).toBe("/invitation/abc123");
    expect(safeInternalPath("/candidate/dashboard")).toBe(
      "/candidate/dashboard",
    );
    expect(safeInternalPath("/recruiter/candidates")).toBe(
      "/recruiter/candidates",
    );
  });

  it("rejects empty, null and undefined", () => {
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath(undefined)).toBeNull();
    expect(safeInternalPath("")).toBeNull();
  });

  it("rejects protocol-relative and absolute URLs", () => {
    expect(safeInternalPath("//evil.com")).toBeNull();
    expect(safeInternalPath("https://evil.com")).toBeNull();
    expect(safeInternalPath("http://evil.com/candidate")).toBeNull();
  });

  it("rejects backslash tricks", () => {
    expect(safeInternalPath("/\\evil.com")).toBeNull();
    expect(safeInternalPath("/candidate\\..\\evil")).toBeNull();
  });

  it("rejects internal paths outside the allowlist", () => {
    expect(safeInternalPath("/random")).toBeNull();
    expect(safeInternalPath("/api/auth/me")).toBeNull();
  });
});
