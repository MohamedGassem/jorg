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
