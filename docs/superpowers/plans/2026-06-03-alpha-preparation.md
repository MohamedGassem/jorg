# Alpha Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare Jorg for LinkedIn alpha launch — restructure candidate profile page into hero+tabs, add recruiter identity to document events, add candidate name to recruiter documents, move templates to Dossiers, simplify recruiter settings to 2 tabs, and gate recruiter signup behind alpha invite codes.

**Architecture:** Six independent tracks. Tracks A and B are pure backend and can run in any order. Tracks C–H are frontend and depend only on their respective backend track (C/E/F depend on B; H depends on A). Read `frontend/AGENTS.md` before any routing work — this Next.js version has non-standard behaviour.

**Tech Stack:** FastAPI + SQLAlchemy 2 async + Alembic + pytest/httpx (backend); Next.js 15 App Router + TypeScript + shadcn/ui + Tailwind (frontend). Package manager: `uv` (backend), `npm` (frontend).

---

## Dependency map

```
Track A (Backend — Alpha invite codes, Tasks 1–4)   → independent
Track B (Backend — Content enrichments, Tasks 5–6)  → independent
Track C (Frontend — Mon dossier hero+tabs, Task 7)   → needs B done (adds avatar_url to type)
Track D (Frontend — Paramètres tabs, Task 8)         → independent
Track E (Frontend — Accès progressive disclosure, Task 9) → needs B done
Track F (Frontend — Dossiers recruteur, Task 10)     → needs B done
Track G (Frontend — Configuration 2 tabs, Task 11)   → independent
Track H (Frontend — Alpha code field + nav, Task 12) → needs A done
```

---

## File map

**Backend — create:**

- `backend/models/alpha.py` — `AlphaInviteCode` model
- `backend/alembic/versions/<hash>_add_alpha_invite_codes.py`
- `backend/services/alpha_service.py` — code generation and validation
- `backend/api/routes/admin.py` — `POST /admin/alpha-codes`
- `backend/schemas/alpha.py` — request/response schemas

**Backend — modify:**

- `backend/models/__init__.py` — export `AlphaInviteCode`
- `backend/schemas/auth.py` — add `alpha_invite_code` to `RegisterRequest`
- `backend/api/routes/auth.py` — validate alpha code in `register`
- `backend/schemas/generation.py` — add recruiter fields to `GeneratedDocumentCandidateView`; add `GeneratedDocumentRecruiterView`
- `backend/services/generation_service.py` — enrich `list_candidate_documents_view`; add `list_org_documents_view`
- `backend/api/routes/generation.py` — use new view for org documents
- `backend/api/main.py` — register admin router

**Frontend — modify:**

- `frontend/types/api.ts` — add `avatar_url` to `CandidateProfile`; add `GeneratedDocumentRecruiterView`; add `recruiter_first_name` / `recruiter_last_name` to `GeneratedDocumentCandidateView`
- `frontend/app/(candidate)/layout.tsx` — rename "Mon profil" → "Mon dossier"
- `frontend/app/(candidate)/candidate/profile/page.tsx` — hero + sticky tabs (restructure)
- `frontend/app/(candidate)/candidate/settings/page.tsx` — add 3 tabs
- `frontend/app/(candidate)/candidate/access/page.tsx` — progressive disclosure on dossier cards
- `frontend/app/(recruiter)/recruiter/documents/page.tsx` — candidate name + templates section
- `frontend/app/(recruiter)/recruiter/settings/page.tsx` — 2 tabs, remove templates

---

## TRACK A — Backend: Alpha invite codes

---

### Task 1: AlphaInviteCode model + Alembic migration

**Files:**

- Create: `backend/models/alpha.py`
- Modify: `backend/models/__init__.py`
- Create: `backend/alembic/versions/<hash>_add_alpha_invite_codes.py`

- [ ] **Step 1: Write the model**

```python
# backend/models/alpha.py
from __future__ import annotations

import secrets
import string
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, UUIDPrimaryKeyMixin


def _generate_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    part1 = "".join(secrets.choice(alphabet) for _ in range(4))
    part2 = "".join(secrets.choice(alphabet) for _ in range(4))
    return f"JORG-{part1}-{part2}"


class AlphaInviteCode(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "alpha_invite_codes"

    code: Mapped[str] = mapped_column(
        String(20), unique=True, index=True, nullable=False, default=_generate_code
    )
    used_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("recruiter_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

- [ ] **Step 2: Export from `__init__.py`**

Open `backend/models/__init__.py` and add after the last import:

```python
from models.alpha import AlphaInviteCode
```

- [ ] **Step 3: Generate the Alembic migration**

```bash
cd backend
uv run alembic revision --autogenerate -m "add_alpha_invite_codes"
```

Verify the generated file creates table `alpha_invite_codes` with columns `id`, `code`, `used_by`, `used_at`, `created_at`.

- [ ] **Step 4: Apply the migration**

```bash
uv run alembic upgrade head
```

Expected: no error, table created.

- [ ] **Step 5: Commit**

```bash
git add backend/models/alpha.py backend/models/__init__.py backend/alembic/versions/
git commit -m "feat(db): add AlphaInviteCode model and migration"
```

---

### Task 2: Alpha service (generate + validate)

**Files:**

- Create: `backend/services/alpha_service.py`
- Create: `backend/schemas/alpha.py`

- [ ] **Step 1: Write the schemas**

```python
# backend/schemas/alpha.py
from pydantic import BaseModel, Field


class AlphaCodeBatchRequest(BaseModel):
    count: int = Field(default=10, ge=1, le=100)


class AlphaCodeBatchResponse(BaseModel):
    codes: list[str]
```

- [ ] **Step 2: Write the failing tests**

```python
# backend/tests/test_alpha_service.py
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from models.alpha import AlphaInviteCode
from services.alpha_service import (
    InvalidAlphaCodeError,
    create_alpha_codes,
    validate_and_consume_code,
)


@pytest.mark.asyncio
async def test_create_alpha_codes_returns_correct_count(db: AsyncSession):
    codes = await create_alpha_codes(db, count=5)
    assert len(codes) == 5
    for code in codes:
        assert code.startswith("JORG-")


@pytest.mark.asyncio
async def test_validate_valid_code_returns_code_object(db: AsyncSession):
    codes = await create_alpha_codes(db, count=1)
    result = await validate_and_consume_code(db, codes[0], consume=False)
    assert result is not None
    assert result.code == codes[0]


@pytest.mark.asyncio
async def test_validate_invalid_code_raises(db: AsyncSession):
    with pytest.raises(InvalidAlphaCodeError):
        await validate_and_consume_code(db, "JORG-FAKE-CODE", consume=False)


@pytest.mark.asyncio
async def test_consume_marks_used_by(db: AsyncSession):
    from uuid import uuid4
    codes = await create_alpha_codes(db, count=1)
    recruiter_id = uuid4()
    await validate_and_consume_code(db, codes[0], consume=True, recruiter_id=recruiter_id)
    # Second call should raise
    with pytest.raises(InvalidAlphaCodeError):
        await validate_and_consume_code(db, codes[0], consume=False)
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend
uv run pytest tests/test_alpha_service.py -v
```

Expected: ImportError (module does not exist yet).

- [ ] **Step 4: Implement the service**

```python
# backend/services/alpha_service.py
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.alpha import AlphaInviteCode, _generate_code


class InvalidAlphaCodeError(Exception):
    """Raised when an alpha invite code is invalid or already used."""


async def create_alpha_codes(db: AsyncSession, count: int = 10) -> list[str]:
    codes = []
    for _ in range(count):
        obj = AlphaInviteCode(code=_generate_code())
        db.add(obj)
        codes.append(obj.code)
    await db.commit()
    return codes


async def validate_and_consume_code(
    db: AsyncSession,
    code: str,
    *,
    consume: bool,
    recruiter_id: UUID | None = None,
) -> AlphaInviteCode:
    result = await db.execute(
        select(AlphaInviteCode).where(AlphaInviteCode.code == code.upper())
    )
    obj = result.scalar_one_or_none()
    if obj is None or obj.used_by is not None:
        raise InvalidAlphaCodeError(code)
    if consume:
        obj.used_by = recruiter_id
        obj.used_at = datetime.now(timezone.utc)
        await db.commit()
    return obj
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
uv run pytest tests/test_alpha_service.py -v
```

Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/services/alpha_service.py backend/schemas/alpha.py backend/tests/test_alpha_service.py
git commit -m "feat(alpha): alpha invite code service and schemas"
```

---

### Task 3: Admin endpoint to generate codes

**Files:**

- Create: `backend/api/routes/admin.py`
- Modify: `backend/api/main.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_admin_routes.py
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_generate_codes_requires_secret(client: AsyncClient):
    resp = await client.post("/admin/alpha-codes", json={"count": 3})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_generate_codes_returns_codes(client: AsyncClient, monkeypatch):
    monkeypatch.setenv("ADMIN_SECRET", "test-secret")
    resp = await client.post(
        "/admin/alpha-codes",
        json={"count": 3},
        headers={"X-Admin-Secret": "test-secret"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert len(data["codes"]) == 3
    assert all(c.startswith("JORG-") for c in data["codes"])
```

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest tests/test_admin_routes.py -v
```

Expected: FAIL (route does not exist).

- [ ] **Step 3: Implement the admin router**

```python
# backend/api/routes/admin.py
import os

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from schemas.alpha import AlphaCodeBatchRequest, AlphaCodeBatchResponse
from services.alpha_service import create_alpha_codes

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin_secret(request: Request) -> None:
    secret = os.getenv("ADMIN_SECRET", "")
    if not secret or request.headers.get("X-Admin-Secret") != secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.post(
    "/alpha-codes",
    response_model=AlphaCodeBatchResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_require_admin_secret)],
)
async def generate_alpha_codes(
    payload: AlphaCodeBatchRequest,
    db: AsyncSession = Depends(get_db),
) -> AlphaCodeBatchResponse:
    codes = await create_alpha_codes(db, count=payload.count)
    return AlphaCodeBatchResponse(codes=codes)
```

- [ ] **Step 4: Register the router in `main.py`**

Open `backend/api/main.py`, find the block where routers are included (look for `app.include_router`), and add:

```python
from api.routes.admin import router as admin_router
app.include_router(admin_router)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
uv run pytest tests/test_admin_routes.py -v
```

Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/api/routes/admin.py backend/api/main.py backend/tests/test_admin_routes.py
git commit -m "feat(admin): POST /admin/alpha-codes endpoint"
```

---

### Task 4: Gate recruiter registration behind alpha code

**Files:**

- Modify: `backend/schemas/auth.py`
- Modify: `backend/api/routes/auth.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_auth_alpha.py
import os
import pytest
from httpx import AsyncClient
from services.alpha_service import create_alpha_codes
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_recruiter_register_requires_code_when_enabled(
    client: AsyncClient, monkeypatch
):
    monkeypatch.setenv("ALPHA_INVITE_REQUIRED", "true")
    resp = await client.post(
        "/auth/register",
        json={"email": "rec@test.com", "password": "password123", "role": "recruiter"},
    )
    assert resp.status_code == 400
    assert "alpha" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_recruiter_register_succeeds_with_valid_code(
    client: AsyncClient, db: AsyncSession, monkeypatch
):
    monkeypatch.setenv("ALPHA_INVITE_REQUIRED", "true")
    codes = await create_alpha_codes(db, count=1)
    resp = await client.post(
        "/auth/register",
        json={
            "email": "rec2@test.com",
            "password": "password123",
            "role": "recruiter",
            "alpha_invite_code": codes[0],
        },
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_candidate_register_does_not_require_code(
    client: AsyncClient, monkeypatch
):
    monkeypatch.setenv("ALPHA_INVITE_REQUIRED", "true")
    resp = await client.post(
        "/auth/register",
        json={"email": "cand@test.com", "password": "password123", "role": "candidate"},
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_register_disabled_when_env_false(client: AsyncClient, monkeypatch):
    monkeypatch.setenv("ALPHA_INVITE_REQUIRED", "false")
    resp = await client.post(
        "/auth/register",
        json={"email": "rec3@test.com", "password": "password123", "role": "recruiter"},
    )
    assert resp.status_code == 201
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest tests/test_auth_alpha.py -v
```

Expected: 3 tests FAIL (no alpha_invite_code field, no validation).

- [ ] **Step 3: Update `RegisterRequest` schema**

In `backend/schemas/auth.py`, add the optional field:

```python
from pydantic import BaseModel, EmailStr, Field

from models.user import UserRole


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole
    alpha_invite_code: str | None = None  # required for recruiter when ALPHA_INVITE_REQUIRED=true
```

- [ ] **Step 4: Update `register` endpoint in `auth.py`**

In `backend/api/routes/auth.py`, import the alpha service and add validation logic before `register_user`:

```python
import os
from services.alpha_service import InvalidAlphaCodeError, validate_and_consume_code
from models.user import UserRole
```

Replace the `register` endpoint body (keep signature unchanged):

```python
@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
async def register(
    request: Request,
    payload: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserRead:
    # Alpha invite gate — only for recruiter role
    if (
        payload.role == UserRole.RECRUITER
        and os.getenv("ALPHA_INVITE_REQUIRED", "true").lower() == "true"
    ):
        if not payload.alpha_invite_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Un code d'invitation alpha est requis pour créer un compte recruteur.",
            )
        try:
            # validate only — consume after user/profile is created
            await validate_and_consume_code(db, payload.alpha_invite_code, consume=False)
        except InvalidAlphaCodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Code d'invitation invalide ou déjà utilisé.",
            )

    try:
        user = await register_user(db, payload.email, payload.password, payload.role)
    except EmailAlreadyRegisteredError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="email already registered",
        ) from e

    # Consume the alpha code now that the user is created
    if (
        payload.role == UserRole.RECRUITER
        and payload.alpha_invite_code
        and os.getenv("ALPHA_INVITE_REQUIRED", "true").lower() == "true"
    ):
        try:
            # Get the recruiter profile id — it may not exist yet (created lazily)
            await validate_and_consume_code(
                db, payload.alpha_invite_code, consume=True, recruiter_id=None
            )
        except InvalidAlphaCodeError:
            pass  # already consumed between validation and creation — acceptable race

    send_verification_email(user)
    return UserRead.model_validate(user)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
uv run pytest tests/test_auth_alpha.py -v
```

Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/schemas/auth.py backend/api/routes/auth.py backend/tests/test_auth_alpha.py
git commit -m "feat(auth): gate recruiter registration behind ALPHA_INVITE_REQUIRED env var"
```

---

## TRACK B — Backend: Content enrichments

---

### Task 5: Add recruiter info to GeneratedDocumentCandidateView

**Files:**

- Modify: `backend/schemas/generation.py`
- Modify: `backend/services/generation_service.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_candidate_document_view.py
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from services.generation_service import list_candidate_documents_view


@pytest.mark.asyncio
async def test_candidate_document_view_includes_recruiter_name(
    db: AsyncSession, generated_doc_fixture  # use existing fixture or create one
):
    # This test checks the shape of the returned objects
    # Use your test fixtures to set up an org, recruiter, candidate, and doc
    docs = await list_candidate_documents_view(db, generated_doc_fixture.candidate_id)
    assert len(docs) > 0
    doc = docs[0]
    assert hasattr(doc, "recruiter_first_name")
    assert hasattr(doc, "recruiter_last_name")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest tests/test_candidate_document_view.py -v
```

Expected: AttributeError — field does not exist.

- [ ] **Step 3: Update `GeneratedDocumentCandidateView` schema**

In `backend/schemas/generation.py`, extend `GeneratedDocumentCandidateView`:

```python
class GeneratedDocumentCandidateView(BaseModel):
    """Used for GET /candidates/me/documents — includes joined human-readable names."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    generated_at: datetime
    file_format: str
    organization_name: str
    organization_id: UUID
    template_name: str
    recruiter_first_name: str | None
    recruiter_last_name: str | None
```

- [ ] **Step 4: Update `list_candidate_documents_view` in the service**

In `backend/services/generation_service.py`, update the function to join RecruiterProfile:

```python
async def list_candidate_documents_view(
    db: AsyncSession, candidate_id: UUID
) -> list[GeneratedDocumentCandidateView]:
    from models.invitation import AccessGrant
    from models.recruiter import RecruiterProfile
    from models.user import User

    rows = await db.execute(
        select(
            GeneratedDocument.id,
            GeneratedDocument.generated_at,
            GeneratedDocument.file_format,
            Organization.name.label("organization_name"),
            AccessGrant.organization_id.label("organization_id"),
            Template.name.label("template_name"),
            RecruiterProfile.first_name.label("recruiter_first_name"),
            RecruiterProfile.last_name.label("recruiter_last_name"),
        )
        .join(AccessGrant, GeneratedDocument.access_grant_id == AccessGrant.id)
        .join(Organization, AccessGrant.organization_id == Organization.id)
        .join(Template, GeneratedDocument.template_id == Template.id)
        .outerjoin(
            RecruiterProfile,
            RecruiterProfile.user_id == GeneratedDocument.generated_by_user_id,
        )
        .where(AccessGrant.candidate_id == candidate_id)
        .order_by(GeneratedDocument.generated_at.desc())
    )
    return [
        GeneratedDocumentCandidateView(
            id=row.id,
            generated_at=row.generated_at,
            file_format=row.file_format,
            organization_name=row.organization_name,
            organization_id=row.organization_id,
            template_name=row.template_name,
            recruiter_first_name=row.recruiter_first_name,
            recruiter_last_name=row.recruiter_last_name,
        )
        for row in rows.all()
    ]
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
uv run pytest tests/test_candidate_document_view.py -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/schemas/generation.py backend/services/generation_service.py backend/tests/test_candidate_document_view.py
git commit -m "feat(docs): add recruiter name to GeneratedDocumentCandidateView"
```

---

### Task 6: GeneratedDocumentRecruiterView — add candidate name to org documents

**Files:**

- Modify: `backend/schemas/generation.py`
- Modify: `backend/services/generation_service.py`
- Modify: `backend/api/routes/generation.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_org_document_recruiter_view.py
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from services.generation_service import list_org_documents_view


@pytest.mark.asyncio
async def test_org_document_view_includes_candidate_name(
    db: AsyncSession, generated_doc_fixture
):
    docs = await list_org_documents_view(db, generated_doc_fixture.org_id)
    assert len(docs) > 0
    doc = docs[0]
    assert hasattr(doc, "candidate_first_name")
    assert hasattr(doc, "candidate_last_name")
    assert hasattr(doc, "opportunity_title")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest tests/test_org_document_recruiter_view.py -v
```

Expected: ImportError — function does not exist.

- [ ] **Step 3: Add `GeneratedDocumentRecruiterView` schema**

In `backend/schemas/generation.py`, add after `GeneratedDocumentCandidateView`:

```python
class GeneratedDocumentRecruiterView(BaseModel):
    """Used for GET /organizations/{id}/documents — includes candidate name and opportunity."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    generated_at: datetime
    file_format: str
    template_name: str | None
    candidate_first_name: str | None
    candidate_last_name: str | None
    opportunity_title: str | None
```

- [ ] **Step 4: Add `list_org_documents_view` to the service**

In `backend/services/generation_service.py`, add after `list_org_documents`:

```python
async def list_org_documents_view(
    db: AsyncSession, organization_id: UUID
) -> list[GeneratedDocumentRecruiterView]:
    from models.candidate_profile import CandidateProfile
    from models.invitation import AccessGrant
    from models.opportunity import Opportunity, ShortlistEntry

    rows = await db.execute(
        select(
            GeneratedDocument.id,
            GeneratedDocument.generated_at,
            GeneratedDocument.file_format,
            Template.name.label("template_name"),
            CandidateProfile.first_name.label("candidate_first_name"),
            CandidateProfile.last_name.label("candidate_last_name"),
            Opportunity.title.label("opportunity_title"),
        )
        .join(AccessGrant, GeneratedDocument.access_grant_id == AccessGrant.id)
        .outerjoin(
            CandidateProfile, CandidateProfile.user_id == AccessGrant.candidate_id
        )
        .outerjoin(Template, GeneratedDocument.template_id == Template.id)
        .outerjoin(
            ShortlistEntry, ShortlistEntry.candidate_id == AccessGrant.candidate_id
        )
        .outerjoin(Opportunity, Opportunity.id == ShortlistEntry.opportunity_id)
        .where(AccessGrant.organization_id == organization_id)
        .order_by(GeneratedDocument.generated_at.desc())
    )
    return [
        GeneratedDocumentRecruiterView(
            id=row.id,
            generated_at=row.generated_at,
            file_format=row.file_format,
            template_name=row.template_name,
            candidate_first_name=row.candidate_first_name,
            candidate_last_name=row.candidate_last_name,
            opportunity_title=row.opportunity_title,
        )
        for row in rows.all()
    ]
```

- [ ] **Step 5: Update the org documents route to use the new view**

In `backend/api/routes/generation.py`, find the route that returns org documents (uses `list_org_documents`) and update it to use `list_org_documents_view`:

```python
# Find: from services.generation_service import ..., list_org_documents, ...
# Add: list_org_documents_view
from services.generation_service import (
    ...,
    list_org_documents_view,
)
```

Find the route handler for `GET /organizations/{org_id}/documents` and change:

```python
# Before:
docs = await list_org_documents(db, org_id)
# After:
docs = await list_org_documents_view(db, org_id)
```

Also update `response_model` to `list[GeneratedDocumentRecruiterView]`.

- [ ] **Step 6: Run tests to verify they pass**

```bash
uv run pytest tests/test_org_document_recruiter_view.py -v
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/schemas/generation.py backend/services/generation_service.py backend/api/routes/generation.py backend/tests/test_org_document_recruiter_view.py
git commit -m "feat(docs): add candidate name and opportunity to recruiter document view"
```

---

## TRACK C — Frontend: Mon dossier hero + sticky tabs

> Requires Track B done (adds `recruiter_first_name`/`recruiter_last_name` and `avatar_url` to types).

---

### Task 7: Update frontend types + rename nav

**Files:**

- Modify: `frontend/types/api.ts`
- Modify: `frontend/app/(candidate)/layout.tsx`

- [ ] **Step 1: Add `avatar_url` to `CandidateProfile` and enrich `GeneratedDocumentCandidateView`**

In `frontend/types/api.ts`:

Find `interface CandidateProfile` and add `avatar_url: string | null;` after `location`:

```typescript
export interface CandidateProfile {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  summary: string | null;
  phone: string | null;
  email_contact: string | null;
  linkedin_url: string | null;
  location: string | null;
  avatar_url: string | null;        // ← add
  years_of_experience: number | null;
  // ... rest unchanged
```

Find `interface GeneratedDocumentCandidateView` and add recruiter fields:

```typescript
export interface GeneratedDocumentCandidateView {
  id: string;
  generated_at: string;
  file_format: string;
  organization_name: string;
  organization_id: string;
  template_name: string;
  recruiter_first_name: string | null; // ← add
  recruiter_last_name: string | null; // ← add
}
```

Add `GeneratedDocumentRecruiterView` after `GeneratedDocumentCandidateView`:

```typescript
export interface GeneratedDocumentRecruiterView {
  id: string;
  generated_at: string;
  file_format: string;
  template_name: string | null;
  candidate_first_name: string | null;
  candidate_last_name: string | null;
  opportunity_title: string | null;
}
```

- [ ] **Step 2: Rename nav entry**

In `frontend/app/(candidate)/layout.tsx`, change:

```typescript
{ href: "/candidate/profile", label: "Mon profil" },
```

to:

```typescript
{ href: "/candidate/profile", label: "Mon dossier" },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend
npm run build 2>&1 | head -40
```

Expected: no type errors from the changes above (there may be existing errors in the codebase — only fix ones you introduced).

- [ ] **Step 4: Commit**

```bash
git add frontend/types/api.ts frontend/app/\(candidate\)/layout.tsx
git commit -m "feat(candidate): rename nav Mon profil → Mon dossier, add types for enriched views"
```

---

### Task 8: Restructure profile page — hero + sticky tabs

**Files:**

- Modify: `frontend/app/(candidate)/candidate/profile/page.tsx`

The current page (673 lines) has `InformationsSection`, `ProfileTabs` (with Informations + skills tabs), and the main page component. The new page:

1. Removes `InformationsSection` (it moves to Settings in Task 9)
2. Adds a `ProfileHero` component at the top
3. Keeps skills tabs but without the Informations tab
4. Makes the tab bar sticky

- [ ] **Step 1: Add `ProfileHero` component inside the file**

At the top of `page.tsx`, after the imports, add:

```typescript
function calcCompletion(p: CandidateProfile): number {
  const checks = [
    Boolean(p.avatar_url),
    Boolean(p.title),
    Boolean(p.summary),
    Boolean(p.location),
    Boolean(p.linkedin_url),
    p.availability_status !== "not_available",
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function ProfileHero({ profile, onEdit }: { profile: CandidateProfile; onEdit: () => void }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    profile: CandidateProfile | null;
    experiences: Experience[];
    skills: Skill[];
  } | null>(null);

  async function loadPreview() {
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const [profileData, experiences, skills] = await Promise.all([
        api.get<CandidateProfile>("/candidates/me/profile"),
        api.get<Experience[]>("/candidates/me/experiences"),
        api.get<Skill[]>("/candidates/me/skills"),
      ]);
      setPreviewData({ profile: profileData, experiences, skills });
    } catch {
      // show partial data on error
    } finally {
      setPreviewLoading(false);
    }
  }

  const completion = calcCompletion(profile);
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "—";

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border bg-muted">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={fullName} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xl font-semibold text-muted-foreground">
                {(profile.first_name?.[0] ?? "?").toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h1 className="font-heading text-2xl font-semibold">{fullName}</h1>
            {profile.title && (
              <p className="text-sm text-muted-foreground">{profile.title}</p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${completion}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">{completion}% complété</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadPreview}>
            Aperçu recruteur
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            ✏ Modifier
          </Button>
        </div>
      </div>

      {/* Aperçu recruteur dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Aperçu recruteur</DialogTitle>
          </DialogHeader>
          {previewLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : previewData ? (
            <div className="space-y-4 text-sm">
              {previewData.profile && (
                <div>
                  <p className="text-base font-semibold">
                    {previewData.profile.first_name} {previewData.profile.last_name}
                  </p>
                  {previewData.profile.title && (
                    <p className="text-muted-foreground">{previewData.profile.title}</p>
                  )}
                  {previewData.profile.summary && (
                    <p className="mt-2">{previewData.profile.summary}</p>
                  )}
                </div>
              )}
              {previewData.skills.filter((s) => s.featured).length > 0 && (
                <div>
                  <p className="mb-1 font-medium">Compétences clés</p>
                  <div className="flex flex-wrap gap-1.5">
                    {previewData.skills
                      .filter((s) => s.featured)
                      .map((s) => (
                        <span
                          key={s.id}
                          className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary"
                        >
                          {s.skill_ref.name}
                        </span>
                      ))}
                  </div>
                </div>
              )}
              {previewData.experiences.length > 0 && (
                <div>
                  <p className="mb-2 font-medium">Expériences</p>
                  <div className="space-y-3">
                    {previewData.experiences.map((exp) => (
                      <div key={exp.id} className="rounded border border-border/40 p-3">
                        <p className="font-medium">
                          {exp.client_name} — {exp.role}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {exp.start_date}
                          {exp.end_date ? ` → ${exp.end_date}` : exp.is_current ? " → présent" : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Add `EditProfileDrawer` component**

Add after `ProfileHero`:

```typescript
function EditProfileDrawer({
  open,
  profile,
  onClose,
  onSave,
}: {
  open: boolean;
  profile: CandidateProfile;
  onClose: () => void;
  onSave: (updated: CandidateProfile) => void;
}) {
  const [title, setTitle] = useState(profile.title ?? "");
  const [location, setLocation] = useState(profile.location ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(profile.linkedin_url ?? "");
  const [summary, setSummary] = useState(profile.summary ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.put<CandidateProfile>("/candidates/me/profile", {
        title: title || null,
        location: location || null,
        linkedin_url: linkedinUrl || null,
        summary: summary || null,
      });
      onSave(updated);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier le profil</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <ErrorAlert error={error} />
          <div className="space-y-1">
            <Label htmlFor="edit-title">Titre / poste actuel</Label>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-location">Localisation</Label>
            <Input id="edit-location" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-linkedin">LinkedIn</Label>
            <Input id="edit-linkedin" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-summary">Résumé</Label>
            <textarea
              id="edit-summary"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Update `ProfileTabs` to remove the Informations tab**

Find the `ProfileTabs` function. It uses `useSearchParams` for `?tab=`. Update the tab list to remove `informations` and keep only the 4 CV tabs:

```typescript
const TABS = [
  { key: "experiences", label: "Expériences" },
  { key: "competences", label: "Compétences" },
  { key: "formation", label: "Formation" },
  { key: "langues", label: "Langues" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
```

Make the tab bar sticky:

```typescript
<div className="sticky top-0 z-10 -mx-8 border-b bg-background px-8">
  <div className="flex gap-1">
    {TABS.map((t) => (
      <button
        key={t.key}
        onClick={() => setTab(t.key)}
        className={cn(
          "border-b-2 px-4 py-3 text-sm font-medium transition-colors",
          activeTab === t.key
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        {t.label}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 4: Rewrite the main page component**

Replace the main export with:

```typescript
export default function ProfilePage() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    api.get<CandidateProfile>("/candidates/me/profile").then(setProfile).catch(console.error);
  }, []);

  if (!profile) {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
        <div className="h-10 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <ProfileHero profile={profile} onEdit={() => setEditOpen(true)} />
      <Suspense fallback={<div className="h-10 animate-pulse rounded-lg bg-muted" />}>
        <ProfileTabs />
      </Suspense>
      <EditProfileDrawer
        open={editOpen}
        profile={profile}
        onClose={() => setEditOpen(false)}
        onSave={(updated) => setProfile(updated)}
      />
    </div>
  );
}
```

- [ ] **Step 5: Add missing imports**

At the top of the file, make sure these are imported:

```typescript
import { useEffect, useState, Suspense } from "react";
import { Label } from "@/components/ui/label";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { cn } from "@/lib/utils";
```

Remove imports that are no longer used (the large form imports from `InformationsSection`). Run TypeScript to find unused imports:

```bash
cd frontend && npm run build 2>&1 | grep "profile/page"
```

Fix any reported errors.

- [ ] **Step 6: Verify the page renders**

```bash
cd frontend && npm run dev
```

Navigate to `/candidate/profile`. Verify: hero with name/title/completion bar visible, tabs below sticky, Expériences/Compétences/Formation/Langues tabs present, no Informations tab.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/\(candidate\)/candidate/profile/page.tsx
git commit -m "feat(candidate): Mon dossier hero + sticky tabs, remove Informations tab"
```

---

## TRACK D — Frontend: Paramètres candidat 3 tabs

---

### Task 9: Paramètres with Informations personnelles / Compte / RGPD tabs

**Files:**

- Modify: `frontend/app/(candidate)/candidate/settings/page.tsx`

The current settings page has export + delete account. We add a tab shell and move those into a `RgpdTab` + `CompteTab`. The new `InformationsPersonnellesTab` houses first_name, last_name, email fields (from `/candidates/me/profile` for name, and user email from context or a separate endpoint).

- [ ] **Step 1: Restructure settings page with 3 tabs**

Replace the full file contents with:

```typescript
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { api, ApiError } from "@/lib/api";
import { logout } from "@/lib/auth";
import type { CandidateProfile } from "@/types/api";

type Tab = "infos" | "compte" | "rgpd";

function InformationsPersonnellesTab() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    api
      .get<CandidateProfile>("/candidates/me/profile")
      .then((p) => {
        setProfile(p);
        setFirstName(p.first_name ?? "");
        setLastName(p.last_name ?? "");
      })
      .catch(console.error);
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setIsError(false);
    try {
      const updated = await api.put<CandidateProfile>("/candidates/me/profile", {
        first_name: firstName || null,
        last_name: lastName || null,
      });
      setProfile(updated);
      setMessage("Informations mises à jour.");
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof ApiError ? err.detail : "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Informations personnelles</CardTitle>
        <CardDescription>Nom et prénom associés à votre compte.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4 max-w-sm">
          <div className="space-y-1">
            <Label htmlFor="first-name">Prénom</Label>
            <Input
              id="first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="last-name">Nom</Label>
            <Input
              id="last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          {message && (
            <p className={isError ? "text-sm text-destructive" : "text-sm text-green-600"}>
              {message}
            </p>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CompteTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (confirmText !== "SUPPRIMER") {
      setDeleteError('Saisir "SUPPRIMER" pour confirmer');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete<void>("/candidates/me");
      await logout();
      window.location.href = "/";
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.detail : "Échec de la suppression");
      setDeleting(false);
    }
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">Supprimer le compte</CardTitle>
        <CardDescription>
          Cette action est irréversible. Toutes vos données seront supprimées.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => setDialogOpen(true)}>
          Supprimer mon compte
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmer la suppression</DialogTitle>
              <DialogDescription>
                Saisir <strong>SUPPRIMER</strong> pour confirmer.
              </DialogDescription>
            </DialogHeader>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="SUPPRIMER"
            />
            <ErrorAlert error={deleteError} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Suppression…" : "Supprimer définitivement"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function RgpdTab() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    const today = new Date().toISOString().slice(0, 10);
    try {
      await api.download("/candidates/me/export", `jorg-export-${today}.json`);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.detail : "Échec de l'export");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Données personnelles (RGPD)</CardTitle>
        <CardDescription>
          Téléchargez une copie de toutes vos données au format JSON.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <ErrorAlert error={exportError} />
        <Button onClick={handleExport} disabled={exporting} variant="outline">
          {exporting ? "Export en cours…" : "Exporter mes données"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("infos");

  const tabs: { key: Tab; label: string }[] = [
    { key: "infos", label: "Informations personnelles" },
    { key: "compte", label: "Compte" },
    { key: "rgpd", label: "RGPD" },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Paramètres</h1>
      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {activeTab === "infos" && <InformationsPersonnellesTab />}
      {activeTab === "compte" && <CompteTab />}
      {activeTab === "rgpd" && <RgpdTab />}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | grep "settings/page"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/\(candidate\)/candidate/settings/page.tsx
git commit -m "feat(candidate): Paramètres with 3 tabs — Infos perso / Compte / RGPD"
```

---

## TRACK E — Frontend: Accès candidat progressive disclosure

> Requires Track B done (types updated in Task 7).

---

### Task 10: Progressive disclosure on dossier cards in Accès page

**Files:**

- Modify: `frontend/app/(candidate)/candidate/access/page.tsx`

The documents section currently shows `file_format` and a download button. Replace with a collapsible card showing recruiter + date collapsed, opportunity + download expanded.

- [ ] **Step 1: Add `DocCard` component at the top of the file**

Add after the imports:

```typescript
function DocCard({
  doc,
  onDownload,
}: {
  doc: GeneratedDocumentCandidateView;
  onDownload: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const recruiterName = [doc.recruiter_first_name, doc.recruiter_last_name]
    .filter(Boolean)
    .join(" ");
  const displayName = recruiterName
    ? doc.organization_name
      ? `${recruiterName} de ${doc.organization_name}`
      : recruiterName
    : doc.organization_name;

  const relativeDate = (() => {
    const diff = Date.now() - new Date(doc.generated_at).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "aujourd'hui";
    if (days === 1) return "hier";
    if (days < 7) return `il y a ${days} jours`;
    return new Date(doc.generated_at).toLocaleDateString("fr-FR");
  })();

  return (
    <div className="rounded-lg border bg-card">
      <button
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
        onClick={() => setExpanded((p) => !p)}
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <p className="text-xs text-muted-foreground">{relativeDate}</p>
        </div>
        <span className="shrink-0 text-muted-foreground">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="border-t px-4 py-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            {doc.template_name ? `Template : ${doc.template_name}` : ""}
          </p>
          <Button size="sm" variant="outline" onClick={onDownload}>
            Télécharger
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace the dossiers rendering section**

Find the part of the page that renders `orgDocs[org.organization_id]`. Replace the inner doc map with `DocCard`:

```typescript
// Find the docs rendering block and replace the li items with:
{(orgDocs[org.organization_id] ?? []).map((doc) => (
  <DocCard
    key={doc.id}
    doc={doc}
    onDownload={() =>
      download(
        `/documents/${doc.id}/download`,
        `dossier-${doc.id}.${doc.file_format}`,
      )
    }
  />
))}
```

- [ ] **Step 3: Verify build**

```bash
cd frontend && npm run build 2>&1 | grep "access/page"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/\(candidate\)/candidate/access/page.tsx
git commit -m "feat(candidate): progressive disclosure on dossier cards in Accès page"
```

---

## TRACK F — Frontend: Dossiers recruteur enrichis + Templates

> Requires Track B done (types updated in Task 7).

---

### Task 11: Recruiter Documents page — candidate name + templates section

**Files:**

- Modify: `frontend/app/(recruiter)/recruiter/documents/page.tsx`

- [ ] **Step 1: Update type usage from `GeneratedDocument` to `GeneratedDocumentRecruiterView`**

In `documents/page.tsx`, change the state type:

```typescript
import type { GeneratedDocumentRecruiterView } from "@/types/api";

// Change state:
const [docs, setDocs] = useState<GeneratedDocumentRecruiterView[]>([]);

// Change fetch call type annotation:
api.get<GeneratedDocumentRecruiterView[]>(`/organizations/${orgId}/documents`);
```

- [ ] **Step 2: Add a `DocumentCard` component in the file**

```typescript
function DocumentCard({
  doc,
  orgId,
  onDownload,
}: {
  doc: GeneratedDocumentRecruiterView;
  orgId: string;
  onDownload: () => void;
}) {
  const candidateName =
    [doc.candidate_first_name, doc.candidate_last_name].filter(Boolean).join(" ") ||
    "Candidat inconnu";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{candidateName}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(doc.generated_at).toLocaleString("fr-FR")}
              {doc.opportunity_title && ` · ${doc.opportunity_title}`}
            </p>
          </div>
          {doc.file_format && (
            <Badge variant="secondary">{doc.file_format.toUpperCase()}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Button size="sm" variant="outline" onClick={onDownload}>
          Télécharger
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Add Templates section and tab bar**

Add a tab bar at the top of the page content: "Dossiers générés" | "Templates". The Templates tab shows the same content as the current Settings > Templates tab (list + link to `/recruiter/templates`).

Add to state:

```typescript
type DocTab = "dossiers" | "templates";
const [activeTab, setActiveTab] = useState<DocTab>("dossiers");
const [templates, setTemplates] = useState<Template[]>([]);
```

Add to the useEffect (alongside document loading):

```typescript
if (orgId) {
  api
    .get<Template[]>(`/organizations/${orgId}/templates`)
    .then(setTemplates)
    .catch(() => {});
}
```

Update the return JSX to include tab bar and conditional rendering:

```typescript
return (
  <div className="max-w-2xl space-y-6">
    <h1 className="text-2xl font-bold">Dossiers</h1>
    <ErrorAlert error={orgError ?? fetchError} />

    {/* Tab bar */}
    <div className="flex gap-1 border-b">
      {(["dossiers", "templates"] as DocTab[]).map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors capitalize ${
            activeTab === tab
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab === "dossiers" ? "Dossiers générés" : "Templates"}
        </button>
      ))}
    </div>

    {activeTab === "dossiers" && (
      <>
        {docs.length === 0 ? (
          <EmptyState message="Aucun dossier généré par votre organisation." />
        ) : (
          <ul className="space-y-3" role="list">
            {docs.map((doc) => (
              <li key={doc.id}>
                <DocumentCard
                  doc={doc}
                  orgId={orgId}
                  onDownload={() =>
                    download(`/documents/${doc.id}/download`, `dossier-${doc.id}.${doc.file_format ?? "docx"}`)
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </>
    )}

    {activeTab === "templates" && (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {templates.length} template{templates.length !== 1 ? "s" : ""}
          </p>
          <a
            href="/recruiter/templates"
            className="text-sm font-medium text-primary hover:underline"
          >
            Gérer les templates →
          </a>
        </div>
        {templates.length === 0 ? (
          <EmptyState message="Aucun template. Cliquez sur «Gérer les templates» pour en créer." />
        ) : (
          <ul className="space-y-2" role="list">
            {templates.map((t) => (
              <li key={t.id} className="rounded-lg border p-3 text-sm">
                <span className="font-medium">{t.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )}
  </div>
);
```

Add `import type { Template } from "@/types/api";` to imports.

- [ ] **Step 4: Verify build**

```bash
cd frontend && npm run build 2>&1 | grep "documents/page"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/\(recruiter\)/recruiter/documents/page.tsx
git commit -m "feat(recruiter): candidate name on documents, Templates section in Dossiers"
```

---

## TRACK G — Frontend: Configuration recruteur 2 tabs

---

### Task 12: Simplify Settings to Profil personnel + Organisation tabs

**Files:**

- Modify: `frontend/app/(recruiter)/recruiter/settings/page.tsx`

Currently has 3 tabs: organisation | membres | templates. New: profil_personnel | organisation (organisation merges old organisation + membres). Templates tab is removed (moved to Dossiers).

- [ ] **Step 1: Update tab type and list**

```typescript
type Tab = "profil" | "organisation";
```

Remove `"templates"` from the tabs array:

```typescript
const tabs: { key: Tab; label: string }[] = [
  { key: "profil", label: "Profil personnel" },
  { key: "organisation", label: "Organisation" },
];
```

- [ ] **Step 2: Add `ProfilPersonnelTab`**

Add a new tab section that shows the recruiter's own profile fields (first_name, last_name, job_title). Fetch from `GET /recruiters/me/profile` (check the existing endpoint in `api/routes/recruiters.py`):

```typescript
function ProfilPersonnelTab() {
  const [profile, setProfile] = useState<{
    first_name: string | null;
    last_name: string | null;
    job_title: string | null;
  } | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ first_name: string | null; last_name: string | null; job_title: string | null }>(
        "/recruiters/me/profile",
      )
      .then((p) => {
        setProfile(p);
        setFirstName(p.first_name ?? "");
        setLastName(p.last_name ?? "");
        setJobTitle(p.job_title ?? "");
      })
      .catch(console.error);
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api.put("/recruiters/me/profile", {
        first_name: firstName || null,
        last_name: lastName || null,
        job_title: jobTitle || null,
      });
      setMessage("Profil mis à jour.");
    } catch {
      setMessage("Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profil personnel</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4 max-w-sm">
          <div className="space-y-1">
            <Label htmlFor="rec-first-name">Prénom</Label>
            <Input id="rec-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rec-last-name">Nom</Label>
            <Input id="rec-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rec-job-title">Titre / poste</Label>
            <Input id="rec-job-title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
          <Button type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Merge Organisation + Membres into one Organisation tab**

In the existing JSX, the Organisation tab shows org name/logo. The Membres tab shows the member list + join code. Merge them into a single `activeTab === "organisation"` block containing both Card sections sequentially.

- [ ] **Step 4: Remove the Templates tab block**

Delete the `{activeTab === "templates" && ...}` block entirely.

- [ ] **Step 5: Add `ProfilPersonnelTab` to the render**

```typescript
{activeTab === "profil" && <ProfilPersonnelTab />}
{activeTab === "organisation" && (
  // existing organisation + membres content merged
)}
```

- [ ] **Step 6: Verify build**

```bash
cd frontend && npm run build 2>&1 | grep "settings/page"
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/\(recruiter\)/recruiter/settings/page.tsx
git commit -m "feat(recruiter): Configuration 2 tabs — Profil personnel + Organisation, remove Templates"
```

---

## TRACK H — Frontend: Alpha invite code field

> Requires Track A done.

---

### Task 13: Add alpha invite code field to recruiter signup

**Files:**

- Modify: recruiter signup form (find with: `grep -r "role.*recruiter\|recruiter.*register" frontend/app --include="*.tsx" -l`)

- [ ] **Step 1: Find the recruiter signup form**

```bash
grep -r "register\|signup\|inscription" frontend/app --include="*.tsx" -l | grep -i "recruiter\|auth"
```

Identify the file. It is likely `frontend/app/(recruiter)/auth/signup/page.tsx` or similar.

- [ ] **Step 2: Add `alpha_invite_code` field**

In the signup form state, add:

```typescript
const [alphaCode, setAlphaCode] = useState("");
```

In the form JSX, add after the password field:

```typescript
<div className="space-y-1">
  <Label htmlFor="alpha-code">Code d'accès alpha</Label>
  <Input
    id="alpha-code"
    value={alphaCode}
    onChange={(e) => setAlphaCode(e.target.value.toUpperCase())}
    placeholder="JORG-XXXX-YYYY"
    required
  />
  <p className="text-xs text-muted-foreground">
    Code d'invitation requis pendant la phase alpha.
  </p>
</div>
```

In the submit handler, include the field in the request body:

```typescript
await api.post("/auth/register", {
  email,
  password,
  role: "recruiter",
  alpha_invite_code: alphaCode,
});
```

- [ ] **Step 3: Verify build**

```bash
cd frontend && npm run build 2>&1 | grep "signup\|register"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/\(recruiter\)/  # add the specific signup file
git commit -m "feat(recruiter): alpha invite code field on recruiter signup"
```

---

## Self-review checklist

**Spec coverage:**

| Spec requirement                                                 | Task             |
| ---------------------------------------------------------------- | ---------------- |
| Mon dossier nav rename                                           | Task 7           |
| Hero (photo, nom, titre, complétion, aperçu recruteur, modifier) | Task 8           |
| Sticky tabs Expériences/Compétences/Formation/Langues            | Task 8           |
| Paramètres 3 onglets                                             | Task 9           |
| Accès progressive disclosure                                     | Task 10          |
| Dossiers recruteur — nom candidat                                | Task 11          |
| Templates dans Dossiers                                          | Task 11          |
| Configuration 2 onglets                                          | Task 12          |
| Alpha invite codes backend                                       | Tasks 1–4        |
| Recruiter signup field                                           | Task 13          |
| Recruiter identity on candidate doc events                       | Task 5 + Task 10 |
| `avatar_url` in frontend type                                    | Task 7           |

**Known gaps:**

- `avatar_url` upload endpoint: the hero renders `avatar_url` from profile but there is no photo upload implemented yet. The click-to-upload placeholder is in `ProfileHero` but the `POST /candidates/me/avatar` endpoint (or equivalent) does not exist. **Scope decision:** render the avatar if present, remove the "clic pour upload" affordance from the hero for MVP (it will error). Add a note in the implementation: comment out the upload click handler and add a `// TODO: avatar upload endpoint` comment.
- `InteractionEvent` (dashboard activity feed) `document_generated` events: the spec also wants recruiter identity on dashboard activity events. The `InteractionEvent.metadata` in `OrganizationInteractionCard` does not include recruiter name. This would require updating the event creation in the backend. **Scope:** this is a separate backend change — add a Task 14 below.

---

### Task 14: Add recruiter name to document_generated events in dashboard

**Files:**

- Modify: `backend/services/generation_service.py` (where `document_generated` event is created)
- Modify: `frontend/types/api.ts` — add recruiter fields to `InteractionEvent.metadata`
- Modify: `frontend/app/(candidate)/candidate/dashboard/page.tsx` — display recruiter name in activity

- [ ] **Step 1: Find where `document_generated` events are stored**

```bash
grep -r "document_generated" backend --include="*.py" -n
```

- [ ] **Step 2: Update metadata to include recruiter name**

In the file that creates `document_generated` events, add `recruiter_first_name` and `recruiter_last_name` to the metadata dict when the event is created.

- [ ] **Step 3: Update `InteractionEvent` frontend type**

In `frontend/types/api.ts`, extend the metadata type:

```typescript
export interface InteractionEvent {
  type: InteractionEventType;
  occurred_at: string;
  metadata: {
    template_name?: string | null;
    file_format?: string | null;
    recruiter_first_name?: string | null;
    recruiter_last_name?: string | null;
  };
}
```

- [ ] **Step 4: Update dashboard activity rendering**

In `frontend/app/(candidate)/candidate/dashboard/page.tsx`, find where `document_generated` events are displayed. Update the label to show recruiter name:

```typescript
// In the event label function, for document_generated:
case "document_generated": {
  const r = [event.metadata.recruiter_first_name, event.metadata.recruiter_last_name]
    .filter(Boolean)
    .join(" ");
  return r ? `Dossier généré par ${r}` : "Dossier généré";
}
```

- [ ] **Step 5: Verify build**

```bash
cd frontend && npm run build 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/ frontend/types/api.ts frontend/app/\(candidate\)/candidate/dashboard/page.tsx
git commit -m "feat(events): add recruiter name to document_generated activity events"
```
