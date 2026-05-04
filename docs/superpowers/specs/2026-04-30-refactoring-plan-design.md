# Jorg — Refactoring Plan (Approach B: Layer-level Refactor)

**Date:** 2026-04-30
**Status:** Design validated, ready for implementation plan
**Scope:** Full-stack — FastAPI backend + Next.js frontend
**Constraint:** API contract and DB models are untouched; logic stays byte-for-byte equivalent

---

## Context & Motivation

The codebase is well-structured for an MVP but shows clear duplication and complexity that will compound as features grow. This refactoring pass eliminates ~200 lines of copy-paste backend CRUD, splits an overloaded generation service, unifies error handling on both sides, and consolidates ~15 repeated frontend patterns into reusable hooks and components.

The goal is a general cleanup before the codebase grows further — not a preparatory refactor for a specific feature.

---

## What Does NOT Change

- Database models (`models/`)
- Alembic migrations
- API routes and HTTP contracts (URL paths, request/response shapes)
- Pydantic schemas
- Business logic (access grant checks, invitation flow, document generation algorithm)
- Frontend page routing structure

---

## Backend Refactoring

### B1 — Generic CRUD Service (`services/base_crud.py`)

**Problem:** `candidate_service.py` contains 5 operations × 5 models (Experience, Skill, Education, Certification, Language) = ~200 lines of near-identical code. Any change to CRUD behavior requires touching 5 places.

**Solution:** Extract a typed generic `CRUDService` class:

```python
class CRUDService[T: Base, CreateSchema, UpdateSchema]:
    def __init__(self, model: type[T], owner_field: str) -> None: ...
    async def list(self, db: AsyncSession, owner_id: UUID) -> list[T]: ...
    async def create(self, db: AsyncSession, owner_id: UUID, data: CreateSchema) -> T: ...
    async def get(self, db: AsyncSession, item_id: UUID, owner_id: UUID) -> T | None: ...
    async def update(self, db: AsyncSession, item: T, data: UpdateSchema) -> T: ...
    async def delete(self, db: AsyncSession, item: T) -> None: ...
```

Each sub-model service becomes a one-liner:

```python
experience_crud = CRUDService(Experience, "profile_id")
skill_crud      = CRUDService(Skill, "profile_id")
# etc.
```

`candidate_service.py` retains only non-generic logic: `get_or_create_profile()`, `list_organization_interactions()`, and `get_rgpd_export()`.

**Profile dependency:** The 9 redundant `get_or_create_profile()` calls in `api/routes/candidates.py` (one per endpoint) are replaced by a single FastAPI dependency injected at the router level, fetching the profile once per request.

**Files affected:**

- `backend/services/base_crud.py` (new)
- `backend/services/candidate_service.py` (gutted from 395 → ~120 lines)
- `backend/api/routes/candidates.py` (inject profile dependency)

---

### B2 — Exception Hierarchy (`core/exceptions.py`)

**Problem:** Services raise `ValueError("no_active_grant")`, `ValueError("invitation_expired")`, custom `NoActiveGrantError`, `DuplicateShortlistEntryError` — all handled differently in routes via string-matching or `except` blocks.

**Solution:** A unified exception hierarchy in `core/exceptions.py`:

```python
class JorgError(Exception):
    status_code: int
    detail: str

class NotFoundError(JorgError):       status_code = 404
class ForbiddenError(JorgError):      status_code = 403
class ConflictError(JorgError):       status_code = 409
class BusinessRuleError(JorgError):   status_code = 422
```

A single FastAPI exception handler registered in `main.py` maps every `JorgError` subclass to the right HTTP response. All `ValueError` string-matching in route handlers is deleted.

Services raise semantically: `raise NotFoundError("template not found")`, `raise ForbiddenError("no active grant")`.

**Files affected:**

- `backend/core/exceptions.py` (new)
- `backend/main.py` (register handler)
- `backend/services/invitation_service.py`
- `backend/services/generation_service.py`
- `backend/services/opportunity_service.py`
- `backend/api/routes/candidates.py`
- `backend/api/routes/organizations.py`
- `backend/api/routes/opportunities.py`

---

### B3 — Document Engine (`services/docx_engine.py`)

**Problem:** `generation_service.py` (322 lines) mixes pure placeholder logic, DB reads, file I/O, and subprocess calls. The XML manipulation block (`_apply_block`, `_replace_in_paragraph`) is untestable without a real DB and filesystem.

**Solution:** Split into two modules:

**`services/docx_engine.py`** — pure functions, no I/O:

- `build_context(profile: CandidateProfile) -> dict[str, Any]` — maps profile fields to placeholder values
- `expand_blocks(doc: Document, context: dict) -> None` — handles `{{#BLOCK}}...{{/BLOCK}}` expansion
- `replace_placeholders(doc: Document, context: dict) -> None` — replaces simple `{{KEY}}` placeholders
- `generate_docx(template_path: Path, mappings: dict, profile: CandidateProfile) -> bytes` — composes the above, returns bytes

All XML manipulation stays in this file, identical to current logic — only location changes.

**`services/generation_service.py`** — thin orchestrator (~80 lines):

- Loads DB records (AccessGrant, Template, CandidateProfile)
- Calls `docx_engine.generate_docx()`
- Optionally calls `convert_to_pdf()` (subprocess, stays here)
- Writes file via `storage.save()`
- Creates `GeneratedDocument` DB record

**Files affected:**

- `backend/services/docx_engine.py` (new, extracted from generation_service)
- `backend/services/generation_service.py` (slimmed to orchestration only)
- `backend/tests/unit/test_docx_engine.py` (new unit tests for pure functions)

---

### B4 — Query Builder (`services/recruiter_service.py`)

**Problem:** `list_accessible_candidates()` (104 lines) is a single function with 10+ conditional filter blocks, making it hard to read, test, or extend.

**Solution:** Extract a `CandidateQueryBuilder` class within `recruiter_service.py`:

```python
class CandidateQueryBuilder:
    def __init__(self, org_id: UUID) -> None: ...
    def filter_availability(self, status: str) -> Self: ...
    def filter_work_mode(self, mode: str) -> Self: ...
    def filter_skills(self, skills: list[str]) -> Self: ...
    def filter_rate(self, max_rate: int) -> Self: ...
    def filter_location(self, location: str) -> Self: ...
    def filter_domain(self, domain: str) -> Self: ...
    def build(self) -> Select: ...
```

`list_accessible_candidates()` becomes a ~15-line function calling the builder. The generated SQL query is identical.

**Files affected:**

- `backend/services/recruiter_service.py`

---

## Frontend Refactoring

### F1 — Shared Hooks (`lib/hooks/`)

**`useAsyncData<T>(fetcher)`**
Replaces the `useEffect → api.get → setState → setLoading → setError` pattern found on 15+ pages.

```ts
const { data, loading, error, refetch } = useAsyncData(() => api.get<T>(url));
```

**`useRecruiterOrg()`**
Replaces the chained recruiter profile → org fetch found in `candidates.tsx`, `opportunities.tsx`, `templates.tsx`, `recruiter/history.tsx`.

```ts
const { orgId, profile, loading, error } = useRecruiterOrg();
```

**`useDownload()`**
Replaces identical download + per-item error state found in `candidate/history.tsx`, `recruiter/history.tsx`, `generate.tsx`.

```ts
const { download, errors } = useDownload();
```

**`useFormField<T>(initial)`**
Replaces the `setForm(prev => ({...prev, [k]: v}))` pattern in every form section.

```ts
const [form, setField, resetForm] =
  useFormField<ExperienceForm>(EMPTY_EXPERIENCE);
```

**Files affected:**

- `frontend/lib/hooks/useAsyncData.ts` (new)
- `frontend/lib/hooks/useRecruiterOrg.ts` (new)
- `frontend/lib/hooks/useDownload.ts` (new)
- `frontend/lib/hooks/useFormField.ts` (new)
- `frontend/lib/hooks/index.ts` (new barrel)
- All 15+ pages that use the above patterns

---

### F2 — Shared Components (`components/ui/`)

**`<StatusBadge>`**
Replaces `STATUS_LABELS` + `STATUS_VARIANTS` dict pairs in `access.tsx`, `requests.tsx`, `invitations.tsx`, `opportunities.tsx`.

```tsx
<StatusBadge
  status={grant.status}
  labels={ACCESS_LABELS}
  variants={ACCESS_VARIANTS}
/>
```

**`<EmptyState>`**
Replaces 11+ inline empty-state paragraphs.

```tsx
<EmptyState message="Aucune compétence pour l'instant." />
```

**`<CRUDSection<T>>`**
Replaces the 6 near-identical sections in `skills.tsx` (Experience, Skill, Education, Certification, Language). Each section currently has: add button, form toggle, list rendering, empty state, delete. The generic component accepts render props for item display and form fields.

```tsx
<CRUDSection<SkillForm>
  title="Compétences"
  items={skills}
  emptyMessage="Aucune compétence"
  renderItem={(s, onDelete) => <SkillCard skill={s} onDelete={onDelete} />}
  renderForm={(form, setField, onSubmit, onCancel) => (
    <SkillForm
      form={form}
      setField={setField}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  )}
  onCreate={handleCreate}
  onDelete={handleDelete}
/>
```

`skills.tsx` reduces from ~500 lines to ~150.

**Files affected:**

- `frontend/components/ui/StatusBadge.tsx` (new)
- `frontend/components/ui/EmptyState.tsx` (new)
- `frontend/components/ui/CRUDSection.tsx` (new)
- `frontend/app/(candidate)/skills/page.tsx`
- `frontend/app/(candidate)/access/page.tsx`
- `frontend/app/(candidate)/requests/page.tsx`
- `frontend/app/(recruiter)/invitations/page.tsx`
- `frontend/app/(recruiter)/opportunities/page.tsx`

---

### F3 — Error Handling (`lib/errors.ts`)

**Problem:** `errMsg()` is defined twice identically. Error display uses `<p role="alert">`, `alert()`, and `console.error` inconsistently.

**Solution:**

- `lib/errors.ts` exports one canonical `extractErrorMessage(err: unknown, fallback: string): string`
- `components/ui/ErrorAlert.tsx` — a consistent `<p role="alert" className="text-destructive">` wrapper
- All pages import from these two; all inline error handling deleted

**Files affected:**

- `frontend/lib/errors.ts` (new)
- `frontend/components/ui/ErrorAlert.tsx` (new)
- All pages with inline error handling

---

### F4 — Shared Constants (`lib/constants.ts`)

**Problem:** `VALID_DOMAINS` and `SKILL_CATEGORIES` are defined in `types/api.ts` but re-declared inline in `candidates.tsx` and `skills.tsx`.

**Solution:** Single source in `types/api.ts` (already exists). Delete inline redeclarations in both pages and import from types.

**Files affected:**

- `frontend/app/(recruiter)/candidates/page.tsx`
- `frontend/app/(candidate)/skills/page.tsx`

---

## Testing Strategy

- All existing tests must pass before and after each change.
- `docx_engine.py` extraction is gated on new unit tests (`test_docx_engine.py`) written first, validating placeholder replacement and block expansion with real `.docx` fixtures.
- The generic `CRUDService` is validated by running existing integration tests against the refactored `candidate_service.py` — behavior must be identical.
- Frontend hooks are validated by running existing Vitest tests; no new tests required unless a hook contains non-trivial logic.

---

## Execution Order (to avoid breakage)

1. Backend exceptions first — establishes the error contract everything else relies on
2. `docx_engine.py` extraction — isolated, testable in isolation
3. `CRUDService` + profile dependency — touches the most files, do after exceptions are stable
4. `CandidateQueryBuilder` — isolated change inside one service file
5. Frontend hooks — independent of backend changes
6. Frontend components — depend on hooks being in place
7. Frontend error handling + constants — cleanup pass, lowest risk

---

## Out of Scope

- Pagination on list endpoints
- Background job queue for document generation
- Rate limiting
- Soft deletes
- Full-text search
- Caching layer
- Frontend E2E tests
