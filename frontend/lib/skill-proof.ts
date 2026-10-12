// Front-side proof mapping for the "Sceau de preuve" (plan décision 3).
// The derived status and evidence count already come from the backend
// projection (GET /candidates/me/skill-projection); here we only translate
// that status into the three chip states and resolve the concrete proof links
// (which experiences / achievements back a skill) from data already loaded.
import type {
  CandidateSkillProjection,
  Experience,
  Skill,
  SkillKind,
  SkillStatus,
} from "@/types/api";

// Usable proofs mirror the backend rollup: accepted or edited, never pending.
const USABLE_REVIEW = new Set(["accepted", "edited"]);

export type SkillProofState = "proven" | "inferred" | "declared";

// evidenced and validated are merged into a single "proven" tier in V1.
export function skillProofState(status: SkillStatus): SkillProofState {
  if (status === "validated" || status === "evidenced") return "proven";
  if (status === "inferred") return "inferred";
  return "declared";
}

export interface SkillProofLink {
  experienceId: string;
  client: string;
  role: string;
  // null for an experience-level usage; the achievement text for a tag.
  achievement: string | null;
}

// Concrete proofs behind each skill, keyed by skill_ref_id, from the
// experiences already in memory. Pending (unconfirmed) usages are excluded so
// the expanded list matches the derived count.
export function buildSkillProofLinks(
  experiences: Experience[],
): Map<string, SkillProofLink[]> {
  const links = new Map<string, SkillProofLink[]>();
  const push = (refId: string, link: SkillProofLink) => {
    const list = links.get(refId);
    if (list) list.push(link);
    else links.set(refId, [link]);
  };
  for (const exp of experiences) {
    for (const usage of exp.skill_usages) {
      if (!USABLE_REVIEW.has(usage.review_status)) continue;
      push(usage.skill_ref_id, {
        experienceId: exp.id,
        client: exp.client_name,
        role: exp.role,
        achievement: null,
      });
    }
    for (const ach of exp.achievements) {
      for (const tag of ach.skill_tags) {
        push(tag.skill_ref_id, {
          experienceId: exp.id,
          client: exp.client_name,
          role: exp.role,
          achievement: ach.description,
        });
      }
    }
  }
  return links;
}

export interface SkillRow {
  id: string; // candidate skill id (edit / delete target)
  skillRefId: string;
  name: string;
  kind: SkillKind;
  state: SkillProofState;
  featured: boolean;
  count: number;
  links: SkillProofLink[];
}

export interface AssembledSkills {
  // Proven or featured: shown in full (garde-fou n°2). Featured first.
  highlighted: SkillRow[];
  // Declared / inferred and not featured: folded behind "+ N autres".
  declared: SkillRow[];
}

// Merge the declared candidate skills with their derived projection and proof
// links, then split them into the shown-in-full and folded groups.
export function assembleSkillRows(
  skills: Skill[],
  projection: CandidateSkillProjection[],
  experiences: Experience[],
): AssembledSkills {
  const projByRef = new Map(projection.map((p) => [p.skill_ref_id, p]));
  const links = buildSkillProofLinks(experiences);

  const rows: SkillRow[] = skills.map((s) => {
    const proj = projByRef.get(s.skill_ref_id);
    return {
      id: s.id,
      skillRefId: s.skill_ref_id,
      name: s.skill_ref.name,
      kind: s.skill_ref.kind,
      state: proj ? skillProofState(proj.status) : "declared",
      featured: s.featured,
      count: proj?.evidence_count ?? 0,
      links: links.get(s.skill_ref_id) ?? [],
    };
  });

  const highlighted = rows
    .filter((r) => r.state === "proven" || r.featured)
    // Stable sort: featured to the head, otherwise input order preserved.
    .sort((a, b) => Number(b.featured) - Number(a.featured));
  const declared = rows
    .filter((r) => r.state !== "proven" && !r.featured)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return { highlighted, declared };
}
