import { describe, expect, it } from "vitest";
import { allMilestonesDone, recruiterMilestones } from "@/lib/premiers-pas";
import type { GeneratedDocumentRecruiterView, Invitation } from "@/types/api";

const ME = "me-user-id";
const OTHER = "other-user-id";

function inv(recruiter_id: string, status: Invitation["status"]): Invitation {
  return {
    id: crypto.randomUUID(),
    recruiter_id,
    organization_id: "org",
    organization_name: null,
    candidate_email: "c@example.com",
    candidate_id: null,
    token: "t",
    status,
    expires_at: "2030-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function doc(
  generated_by_user_id: string | null,
): GeneratedDocumentRecruiterView {
  return {
    id: crypto.randomUUID(),
    generated_at: "2026-01-01T00:00:00Z",
    file_format: "pdf",
    template_name: null,
    candidate_first_name: null,
    candidate_last_name: null,
    opportunity_title: null,
    generated_by_user_id,
  };
}

describe("recruiterMilestones", () => {
  it("is all-false for a brand-new recruiter", () => {
    const m = recruiterMilestones([], [], ME);
    expect(m).toEqual({ invited: false, accepted: false, generated: false });
    expect(allMilestonesDone(m)).toBe(false);
  });

  it("counts only this recruiter's own invitations and documents", () => {
    const m = recruiterMilestones(
      [inv(OTHER, "accepted"), inv(ME, "pending")],
      [doc(OTHER)],
      ME,
    );
    expect(m).toEqual({ invited: true, accepted: false, generated: false });
  });

  it("marks accepted only when one of my invitations is accepted", () => {
    const m = recruiterMilestones(
      [inv(ME, "rejected"), inv(ME, "accepted")],
      [],
      ME,
    );
    expect(m.accepted).toBe(true);
  });

  it("marks generated from my own documents and completes when all met", () => {
    const m = recruiterMilestones([inv(ME, "accepted")], [doc(ME)], ME);
    expect(m).toEqual({ invited: true, accepted: true, generated: true });
    expect(allMilestonesDone(m)).toBe(true);
  });
});
