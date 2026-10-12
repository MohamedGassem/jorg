import { describe, expect, it } from "vitest";
import {
  assembleSkillRows,
  buildSkillProofLinks,
  skillProofState,
} from "@/lib/skill-proof";
import type {
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

function skill(
  id: string,
  refId: string,
  name: string,
  featured = false,
): Skill {
  return {
    id,
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
  evidence_count: number,
  is_profile_highlighted = false,
): CandidateSkillProjection {
  return {
    skill_ref_id: refId,
    skill_name: refId,
    skill_kind: "technical",
    status,
    evidence_count,
    first_used: null,
    last_used: null,
    is_profile_highlighted,
  };
}

describe("skillProofState", () => {
  it("maps validated and evidenced to proven (merged in V1)", () => {
    expect(skillProofState("validated")).toBe("proven");
    expect(skillProofState("evidenced")).toBe("proven");
  });

  it("maps inferred to inferred and declared_only to declared", () => {
    expect(skillProofState("inferred")).toBe("inferred");
    expect(skillProofState("declared_only")).toBe("declared");
  });
});

describe("buildSkillProofLinks", () => {
  function exp(over: Partial<Experience>): Experience {
    return {
      id: "e1",
      profile_id: "p1",
      client_name: "SNCF",
      role: "Tech Lead",
      start_date: "2022-01-01",
      end_date: null,
      is_current: true,
      description: null,
      context: null,
      achievements_summary: null,
      achievements: [],
      skill_usages: [],
      created_at: "",
      updated_at: "",
      ...over,
    };
  }

  it("links a skill used at experience level (no achievement)", () => {
    const experiences = [
      exp({
        skill_usages: [
          {
            id: "u1",
            experience_id: "e1",
            skill_ref_id: "k",
            skill_ref: ref("k", "Kafka"),
            intensity: "primary",
            source: "manual_candidate",
            review_status: "accepted",
            confidence: null,
            validated_at: null,
            created_at: "",
          },
        ],
      }),
    ];
    const links = buildSkillProofLinks(experiences);
    expect(links.get("k")).toEqual([
      {
        experienceId: "e1",
        client: "SNCF",
        role: "Tech Lead",
        achievement: null,
      },
    ]);
  });

  it("links a skill tagged on an achievement, carrying its description", () => {
    const experiences = [
      exp({
        achievements: [
          {
            id: "a1",
            experience_id: "e1",
            description: "Refonte pipeline",
            impact: null,
            order: 0,
            featured: false,
            skill_tags: [
              {
                skill_ref_id: "k",
                skill_ref: ref("k", "Kafka"),
                created_at: "",
              },
            ],
            created_at: "",
            updated_at: "",
          },
        ],
      }),
    ];
    const links = buildSkillProofLinks(experiences);
    expect(links.get("k")).toEqual([
      {
        experienceId: "e1",
        client: "SNCF",
        role: "Tech Lead",
        achievement: "Refonte pipeline",
      },
    ]);
  });

  it("ignores pending usages (not usable proofs)", () => {
    const experiences = [
      exp({
        skill_usages: [
          {
            id: "u1",
            experience_id: "e1",
            skill_ref_id: "k",
            skill_ref: ref("k", "Kafka"),
            intensity: null,
            source: "llm_inferred",
            review_status: "pending",
            confidence: null,
            validated_at: null,
            created_at: "",
          },
        ],
      }),
    ];
    expect(buildSkillProofLinks(experiences).has("k")).toBe(false);
  });
});

describe("assembleSkillRows", () => {
  it("shows proven and featured in full, folds declared/inferred", () => {
    const skills = [
      skill("s1", "k", "Kafka"),
      skill("s2", "py", "Python"),
      skill("s3", "tf", "Terraform"),
      skill("s4", "fl", "Flink"),
      skill("s5", "lk", "Looker", true), // featured but only declared
    ];
    const proj = [
      projection("k", "validated", 4),
      projection("py", "evidenced", 6),
      projection("tf", "declared_only", 0),
      projection("fl", "inferred", 0),
      projection("lk", "declared_only", 0, true),
    ];
    const { highlighted, declared } = assembleSkillRows(skills, proj, []);

    expect(highlighted.map((r) => r.skillRefId)).toEqual(["lk", "k", "py"]);
    expect(declared.map((r) => r.skillRefId).sort()).toEqual(["fl", "tf"]);
  });

  it("carries count from projection and state from status", () => {
    const rows = assembleSkillRows(
      [skill("s1", "k", "Kafka")],
      [projection("k", "validated", 4)],
      [],
    ).highlighted;
    expect(rows[0]).toMatchObject({
      skillRefId: "k",
      name: "Kafka",
      state: "proven",
      count: 4,
      featured: false,
    });
  });

  it("defaults to declared with zero count when no projection exists", () => {
    const { declared } = assembleSkillRows([skill("s1", "k", "Kafka")], [], []);
    expect(declared[0]).toMatchObject({ state: "declared", count: 0 });
  });
});
