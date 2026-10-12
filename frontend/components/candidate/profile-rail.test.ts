import { describe, expect, it } from "vitest";
import { pickActiveSection } from "./profile-rail";

describe("pickActiveSection", () => {
  it("returns -1 when there is no section", () => {
    expect(pickActiveSection([], 300, false)).toBe(-1);
  });

  it("defaults to the first section before any crosses the line", () => {
    expect(pickActiveSection([500, 900, 1400], 300, false)).toBe(0);
  });

  it("picks the last section whose top crossed the line", () => {
    expect(pickActiveSection([-800, 120, 700], 300, false)).toBe(1);
  });

  it("picks the last section at the bottom of the page", () => {
    expect(pickActiveSection([-1200, -400, 600], 300, true)).toBe(2);
  });
});
