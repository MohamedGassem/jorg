# Context glossary

Domain terms used across the codebase and the engineering skills. Use these
words as defined here; do not drift to synonyms.

## Access

- **Access grant** — a row (`AccessGrant`) granting one organization access to one
  candidate. Status is `ACTIVE` or `REVOKED`; there is no expiry. A grant lives
  until it is explicitly revoked.
- **Live access** — an organization has _live access_ to a candidate when an
  `AccessGrant(candidate, org)` exists with status `ACTIVE`. This predicate is
  owned in exactly one place, `services/access_policy.py`:
  - `active_grant_clause()` — the reusable SQL expression, for embedding in
    larger queries.
  - `get_live_access_grant(db, organization_id, candidate_id)` — the lookup form,
    built on the same clause.
  - `require_live_access(...)` — the raising form (403 when there is no live
    access).
    A future change to what "live" means (for example adding grant expiry) changes
    these together, in one module.
- **Org membership** — a recruiter belongs to an organization when
  `recruiter_profile.organization_id == org_id`. Checked by
  `access_policy.is_member` and enforced on routes by the `RecruiterOrgMember`
  FastAPI dependency (`api/deps.py`).

## Recruiter views

- **Accessible dossier** — the recruiter-facing read model of a candidate under
  live access: identity and availability fields plus experiences (with
  achievements and skill usages). Owned by `services/recruiter_service.py`:
  `CandidateQueryBuilder` (filters), `_batch_load_experiences` (one query for
  all profiles), `assemble_accessible_candidates` (pure shaping, unit-tested).
  The future candidate-detail endpoint extends this module, not the pages.
- **Recruiter workspace** — the per-session recruiter context (profile, email,
  organization, org templates, builtin templates) loaded once at the
  `(recruiter)/layout.tsx` seam by `RecruiterWorkspaceProvider`
  (`frontend/components/recruiter-workspace.tsx`) and consumed via
  `useRecruiterWorkspace()` (or its narrow view `useRecruiterOrg()`).
  Pages never re-fetch this context; page-specific data stays in pages.

## Skills and evidence

- **Skill usage**: a row (`ExperienceSkillUsage`) recording that a candidate used
  a skill in a specific experience, with an optional role and intensity. Proof at
  the experience level. _Avoid_: "technology", "skill on the CV".
- **Skill tag**: a row (`AchievementSkillTag`) recording that one achievement
  evidences one skill. Proof at the finest level.
- **Proof**: a skill usage or a skill tag, an observed link between a skill and
  real work. A skill becomes _evidenced_ once it has at least one accepted proof.
  _Avoid_: "mention", "reference".
- **Candidate skill**: the per-candidate standing of a skill (`CandidateSkill`),
  a projection rolled up from its proofs rather than an independently authored
  field. Its `status` is _derived_: `declared_only` (listed only) <
  `inferred` (machine-proposed, unconfirmed) < `evidenced` (at least one accepted
  proof) < `validated`. _Avoid_: treating `CandidateSkill` as a hand-entered list.
- **Declared vs evidenced**: a _declared_ skill comes from the flat skill list of
  a CV import with no link to any experience; an _evidenced_ skill is backed by at
  least one proof. Only evidenced or validated skills drive ranking;
  `self_assessed_level` never does.

## Dossier

- **Dossier**: the persisted, first-class presentation artifact (L3) a recruiter
  uses to present a candidate. It is _thin_: it references a subset of L2 proofs
  and carries arrangement (selection, order, per-dossier featuring, grouping,
  anonymization) plus its own framing text, never the candidate's facts. _Avoid_:
  "export", "generated document" (that is the frozen output, not the Dossier).
- **L3a vs L3b**: an _L3a_ dossier is a generic angle owned by the candidate; an
  _L3b_ dossier is targeted at a private opportunity and owned by the recruiter.
- **Dossier headline**: the dossier-specific framing text (accroche/summary) the
  recruiter writes for one dossier. Presentation native to L3, with no L2 source.
  _Avoid_: "summary" when you mean `achievements_summary`, which is an L2 field.
- **Generated dossier snapshot**: the immutable freeze of a dossier at send time
  (render model plus consent policy), distinct from the living, editable Dossier.
