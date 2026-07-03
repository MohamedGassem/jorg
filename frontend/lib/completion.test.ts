import { describe, expect, it } from "vitest";
import { profileReadability } from "@/lib/completion";
import type {
  Achievement,
  CandidateProfile,
  CandidateSkillProjection,
  Experience,
  Skill,
  SkillReference,
} from "@/types/api";

function ref(id: string, name: string): SkillReference {
  return {
    id,
    name,
    slug: name.toLowerCase(),
    kind: "technical",
    aliases: [],
    esco_uri: null,
    esco_skill_type: null,
    source: "manual",
    description: null,
    is_custom: false,
    creator_candidate_id: null,
  };
}

function achievement(impact: string | null): Achievement {
  return {
    id: `a-${Math.random()}`,
    experience_id: "e1",
    description: "Fait quelque chose",
    impact,
    order: 0,
    featured: false,
    skill_tags: [],
    created_at: "",
    updated_at: "",
  };
}

function experience(
  overrides: Partial<Experience> & { client_name: string },
): Experience {
  return {
    id: `e-${overrides.client_name}`,
    profile_id: "p1",
    role: "Consultant",
    start_date: "2020-01-01",
    end_date: "2021-01-01",
    is_current: false,
    description: null,
    context: null,
    achievements_summary: null,
    achievements: [],
    skill_usages: [],
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function skill(refId: string, name: string, featured: boolean): Skill {
  return {
    id: `s-${refId}`,
    candidate_id: "c1",
    skill_ref_id: refId,
    skill_ref: ref(refId, name),
    self_assessed_level: null,
    featured,
    notes: null,
    created_at: "",
    updated_at: "",
  };
}

function projection(
  refId: string,
  status: CandidateSkillProjection["status"],
  count: number,
): CandidateSkillProjection {
  return {
    skill_ref_id: refId,
    skill_name: refId,
    skill_kind: "technical",
    status,
    evidence_count: count,
    first_used: null,
    last_used: null,
    is_profile_highlighted: false,
  };
}

const fullProfile: CandidateProfile = {
  id: "p1",
  user_id: "u1",
  first_name: "Jane",
  last_name: "Doe",
  title: "Data Engineer",
  summary: "Un résumé clair et complet du parcours.",
  phone: null,
  email_contact: null,
  linkedin_url: null,
  location: "Paris",
  avatar_url: null,
  years_of_experience: 8,
  daily_rate: null,
  contract_type: "freelance",
  annual_salary: null,
  availability_status: "available_now",
  availability_date: null,
  work_mode: "remote",
  location_preference: null,
  preferred_domains: null,
  mission_duration: null,
  onboarding_completed: true,
  created_at: "",
  updated_at: "",
};

describe("profileReadability", () => {
  it("returns 'ready' with no actions when every rule passes", () => {
    const exp = experience({
      client_name: "SNCF",
      achievements: [achievement("Réduction de 30% du temps de build")],
    });
    const skills = [skill("r1", "Kafka", true)];
    const proj = [projection("r1", "evidenced", 2)];

    const diag = profileReadability(fullProfile, [exp], skills, proj);

    expect(diag.level).toBe("ready");
    expect(diag.statusLabel).toBe("Prêt à être lu");
    expect(diag.failureCount).toBe(0);
    expect(diag.actions).toEqual([]);
  });

  it("flags a missing summary first", () => {
    const exp = experience({
      client_name: "SNCF",
      achievements: [achievement("Réduction de 30%")],
    });
    const diag = profileReadability(
      { ...fullProfile, summary: "  " },
      [exp],
      [],
      [],
    );
    expect(diag.actions[0]).toBe("Rédigez un résumé en 3 lignes");
  });

  it("flags availability when 'available_from' has no date", () => {
    const exp = experience({
      client_name: "SNCF",
      achievements: [achievement("Réduction de 30%")],
    });
    const diag = profileReadability(
      {
        ...fullProfile,
        availability_status: "available_from",
        availability_date: null,
      },
      [exp],
      [],
      [],
    );
    expect(diag.actions).toContain("Clarifiez votre disponibilité");
  });

  it("passes availability when 'available_from' has a date", () => {
    const exp = experience({
      client_name: "SNCF",
      achievements: [achievement("Réduction de 30%")],
    });
    const diag = profileReadability(
      {
        ...fullProfile,
        availability_status: "available_from",
        availability_date: "2026-09-01",
      },
      [exp],
      [],
      [],
    );
    expect(diag.actions).not.toContain("Clarifiez votre disponibilité");
  });

  it("names the client of the first recent experience without a realisation", () => {
    const withAch = experience({
      client_name: "SNCF",
      is_current: true,
      end_date: null,
      achievements: [achievement("Réduction de 30%")],
    });
    const withoutAch = experience({
      client_name: "Orange",
      end_date: "2019-01-01",
    });
    const diag = profileReadability(fullProfile, [withAch, withoutAch], [], []);
    expect(diag.actions).toContain(
      "Ajoutez une réalisation à votre mission Orange",
    );
  });

  it("does not check condensed experiences beyond the 5 most recent", () => {
    // 5 recent experiences all with a realisation, one older without.
    const recent = Array.from({ length: 5 }, (_, i) =>
      experience({
        client_name: `Recent${i}`,
        end_date: `2024-0${i + 1}-01`,
        achievements: [achievement("Réduction de 30%")],
      }),
    );
    const older = experience({ client_name: "Vieux", end_date: "2010-01-01" });
    const diag = profileReadability(fullProfile, [...recent, older], [], []);
    expect(diag.actions.some((a) => a.includes("Vieux"))).toBe(false);
  });

  it("flags a numeric impact when no realisation carries a number", () => {
    const exp = experience({
      client_name: "SNCF",
      achievements: [achievement("Amélioration notable des performances")],
    });
    const diag = profileReadability(fullProfile, [exp], [], []);
    expect(diag.actions).toContain("Ajoutez un impact chiffré chez SNCF");
  });

  it("flags a featured skill that is not proven", () => {
    const skills = [skill("r1", "Kafka", true)];
    const proj = [projection("r1", "declared_only", 0)];
    const exp = experience({
      client_name: "SNCF",
      achievements: [achievement("Réduction de 30%")],
    });
    const diag = profileReadability(fullProfile, [exp], skills, proj);
    expect(diag.actions).toContain("Reliez Kafka à une réalisation");
  });

  it("caps actions at 3 and marks 'hard' when 3+ rules fail", () => {
    const bare = {
      ...fullProfile,
      summary: null,
      title: null,
      availability_status: "available_from" as const,
      availability_date: null,
    };
    const exp = experience({ client_name: "SNCF" }); // no achievements
    const diag = profileReadability(bare, [exp], [], []);
    // R1 summary, R2 availability/title, R3 no realisation, R4 no impact => 4.
    expect(diag.failureCount).toBeGreaterThanOrEqual(3);
    expect(diag.level).toBe("hard");
    expect(diag.actions).toHaveLength(3);
  });
});
