# Invitations + Access Grants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the invitation flow (recruiter invites candidate by email) and access grant management (candidate accepts/rejects, can revoke).

**Architecture:** Two new models — `Invitation` (token-based invite with 30-day expiry) and `AccessGrant` (active authorization between a candidate and an organization). Services handle the state machine. Routes are all in a single `invitations.py` router covering both roles.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, Alembic, pytest + testcontainers, same patterns as Plans 1-3.

**Parallelization note:** This plan is independent of Plan 6 (frontend) — both can run simultaneously. Plan 5 (document generation) requires this plan's `AccessGrant` model to be complete first.

**Prerequisite:** Plans 1-3 must be merged (models `User`, `Organization`, `RecruiterProfile`, `CandidateProfile` must exist).

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `backend/models/invitation.py` | Create | `Invitation`, `AccessGrant` models + enums + helpers |
| `backend/models/__init__.py` | Modify | Export new models |
| `backend/schemas/invitation.py` | Create | Pydantic I/O schemas |
| `backend/services/invitation_service.py` | Create | Business logic: create, accept, reject, revoke |
| `backend/tests/integration/test_access_flow.py` | Create | Integration tests (TDD red phase) |
| `backend/api/routes/invitations.py` | Create | All invitation + access endpoints |
| `backend/main.py` | Modify | Register new router |

---

## Task 1: Models + Migration

**Files:**
- Create: `backend/models/invitation.py`
- Modify: `backend/models/__init__.py`
- Create: `backend/alembic/versions/<hash>_create_invitation_access_tables.py` (generated)

- [ ] **Step 1: Create `backend/models/invitation.py`**

```python
# backend/models/invitation.py
from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from uuid import UUID

from sqlalchemy import DateTime, Enum as SQLEnum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class InvitationStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXPIRED = "expired"


class AccessGrantStatus(StrEnum):
    ACTIVE = "active"
    REVOKED = "revoked"


class Invitation(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "invitations"

    recruiter_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    candidate_email: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True
    )
    candidate_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    token: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    status: Mapped[InvitationStatus] = mapped_column(
        SQLEnum(InvitationStatus), default=InvitationStatus.PENDING, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class AccessGrant(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "access_grants"

    candidate_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    status: Mapped[AccessGrantStatus] = mapped_column(
        SQLEnum(AccessGrantStatus), default=AccessGrantStatus.ACTIVE, nullable=False
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


def make_invitation_token() -> str:
    """Generate a cryptographically secure invitation token."""
    return secrets.token_urlsafe(32)


def invitation_expiry() -> datetime:
    """Return timestamp 30 days from now (UTC)."""
    return datetime.now(UTC) + timedelta(days=30)
```

- [ ] **Step 2: Update `backend/models/__init__.py`**

```python
# backend/models/__init__.py
from models.base import Base
from models.candidate_profile import (
    Certification,
    CandidateProfile,
    Education,
    Experience,
    Language,
    LanguageLevel,
    Skill,
    SkillCategory,
)
from models.invitation import AccessGrant, AccessGrantStatus, Invitation, InvitationStatus
from models.recruiter import Organization, RecruiterProfile
from models.template import Template
from models.user import OAuthProvider, User, UserRole

__all__ = [
    "AccessGrant",
    "AccessGrantStatus",
    "Base",
    "Certification",
    "CandidateProfile",
    "Education",
    "Experience",
    "Invitation",
    "InvitationStatus",
    "Language",
    "LanguageLevel",
    "OAuthProvider",
    "Organization",
    "RecruiterProfile",
    "Skill",
    "SkillCategory",
    "Template",
    "User",
    "UserRole",
]
```

- [ ] **Step 3: Generate migration**

Run from `backend/`:
```bash
alembic revision --autogenerate -m "create_invitation_access_tables"
```

Expected: new file in `alembic/versions/` with `create_table("invitations", ...)` and `create_table("access_grants", ...)`.

- [ ] **Step 4: Apply migration**

```bash
alembic upgrade head && alembic current
```

Expected: `<hash> (head)`

- [ ] **Step 5: Commit**

```bash
git add backend/models/invitation.py backend/models/__init__.py backend/alembic/versions/
git commit -m "feat(backend): add Invitation and AccessGrant models + migration"
```

---

## Task 2: Pydantic Schemas

**Files:**
- Create: `backend/schemas/invitation.py`

- [ ] **Step 1: Create `backend/schemas/invitation.py`**

```python
# backend/schemas/invitation.py
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr

from models.invitation import AccessGrantStatus, InvitationStatus


class InvitationCreate(BaseModel):
    candidate_email: EmailStr


class InvitationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    recruiter_id: UUID
    organization_id: UUID
    candidate_email: str
    candidate_id: UUID | None
    status: InvitationStatus
    expires_at: datetime
    created_at: datetime


class AccessGrantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    candidate_id: UUID
    organization_id: UUID
    status: AccessGrantStatus
    granted_at: datetime
    revoked_at: datetime | None
    created_at: datetime
```

- [ ] **Step 2: Verify syntax**

```bash
python -c "from schemas.invitation import InvitationCreate, InvitationRead, AccessGrantRead; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/schemas/invitation.py
git commit -m "feat(backend): add Pydantic schemas for invitations and access grants"
```

---

## Task 3: Service Layer

**Files:**
- Create: `backend/services/invitation_service.py`

- [ ] **Step 1: Create `backend/services/invitation_service.py`**

```python
# backend/services/invitation_service.py
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.invitation import (
    AccessGrant,
    AccessGrantStatus,
    Invitation,
    InvitationStatus,
    invitation_expiry,
    make_invitation_token,
)
from models.user import User


async def create_invitation(
    db: AsyncSession,
    recruiter_id: UUID,
    organization_id: UUID,
    candidate_email: str,
) -> Invitation:
    """Create an invitation; links to existing candidate user if found."""
    result = await db.execute(select(User).where(User.email == candidate_email))
    candidate = result.scalar_one_or_none()

    invitation = Invitation(
        recruiter_id=recruiter_id,
        organization_id=organization_id,
        candidate_email=candidate_email,
        candidate_id=candidate.id if candidate else None,
        token=make_invitation_token(),
        status=InvitationStatus.PENDING,
        expires_at=invitation_expiry(),
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)
    return invitation


async def get_invitation_by_token(db: AsyncSession, token: str) -> Invitation | None:
    result = await db.execute(select(Invitation).where(Invitation.token == token))
    return result.scalar_one_or_none()


async def list_candidate_invitations(
    db: AsyncSession, candidate_email: str, candidate_id: UUID
) -> list[Invitation]:
    """Return invitations sent to this candidate (by email or user id)."""
    result = await db.execute(
        select(Invitation).where(
            (Invitation.candidate_email == candidate_email)
            | (Invitation.candidate_id == candidate_id)
        )
    )
    return list(result.scalars().all())


async def get_active_grant(
    db: AsyncSession, candidate_id: UUID, organization_id: UUID
) -> AccessGrant | None:
    """Return the active AccessGrant for a candidate+org pair, or None."""
    result = await db.execute(
        select(AccessGrant).where(
            AccessGrant.candidate_id == candidate_id,
            AccessGrant.organization_id == organization_id,
            AccessGrant.status == AccessGrantStatus.ACTIVE,
        )
    )
    return result.scalar_one_or_none()


async def accept_invitation(
    db: AsyncSession, invitation: Invitation, candidate_id: UUID
) -> AccessGrant:
    """Accept invitation → create (or return existing) AccessGrant.

    Raises ValueError("invitation_expired") if token is past its expiry.
    """
    now = datetime.now(UTC)
    if invitation.expires_at.replace(tzinfo=UTC) < now:
        invitation.status = InvitationStatus.EXPIRED
        await db.commit()
        raise ValueError("invitation_expired")

    invitation.status = InvitationStatus.ACCEPTED
    invitation.candidate_id = candidate_id

    existing = await get_active_grant(db, candidate_id, invitation.organization_id)
    if existing is not None:
        await db.commit()
        return existing

    grant = AccessGrant(
        candidate_id=candidate_id,
        organization_id=invitation.organization_id,
        status=AccessGrantStatus.ACTIVE,
        granted_at=now,
    )
    db.add(grant)
    await db.commit()
    await db.refresh(grant)
    return grant


async def reject_invitation(db: AsyncSession, invitation: Invitation) -> Invitation:
    invitation.status = InvitationStatus.REJECTED
    await db.commit()
    await db.refresh(invitation)
    return invitation


async def list_candidate_grants(
    db: AsyncSession, candidate_id: UUID
) -> list[AccessGrant]:
    result = await db.execute(
        select(AccessGrant).where(AccessGrant.candidate_id == candidate_id)
    )
    return list(result.scalars().all())


async def revoke_grant(db: AsyncSession, grant: AccessGrant) -> AccessGrant:
    grant.status = AccessGrantStatus.REVOKED
    grant.revoked_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(grant)
    return grant
```

- [ ] **Step 2: Verify syntax**

```bash
python -c "import services.invitation_service; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/services/invitation_service.py
git commit -m "feat(backend): add invitation_service with invite/accept/reject/revoke logic"
```

---

## Task 4: Integration Tests (Red Phase)

**Files:**
- Create: `backend/tests/integration/test_access_flow.py`

- [ ] **Step 1: Create `backend/tests/integration/test_access_flow.py`**

```python
# backend/tests/integration/test_access_flow.py
from httpx import AsyncClient


# ---- helpers ----------------------------------------------------------------


async def _create_org_and_link(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> str:
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Invite Corp"}
    )
    org_id: str = org.json()["id"]
    await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"organization_id": org_id},
    )
    return org_id


# ---- invitation creation ----------------------------------------------------


async def test_recruiter_creates_invitation(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org_id = await _create_org_and_link(client, recruiter_headers)
    r = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "newcandidate@test.com"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["candidate_email"] == "newcandidate@test.com"
    assert data["status"] == "pending"
    assert "token" not in data  # token is not exposed in response... or is it?
    assert "id" in data


async def test_invitation_links_existing_candidate(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id = await _create_org_and_link(client, recruiter_headers)
    r = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "candidate@test.com"},
    )
    assert r.status_code == 201
    assert r.json()["candidate_id"] is not None


async def test_candidate_cannot_create_invitation(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/organizations/00000000-0000-0000-0000-000000000000/invitations",
        headers=candidate_headers,
        json={"candidate_email": "x@test.com"},
    )
    assert r.status_code == 403


async def test_unlinked_recruiter_cannot_invite(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    # recruiter not linked to org → 403
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Other Org"}
    )
    org_id = org.json()["id"]
    # recruiter did NOT link to this org
    r = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "x@test.com"},
    )
    assert r.status_code == 403


# ---- candidate views invitations --------------------------------------------


async def test_candidate_lists_invitations(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id = await _create_org_and_link(client, recruiter_headers)
    await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "candidate@test.com"},
    )
    r = await client.get("/invitations/me", headers=candidate_headers)
    assert r.status_code == 200
    assert len(r.json()) >= 1


# ---- accept flow ------------------------------------------------------------


async def _create_invite_token(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    org_id: str,
    email: str = "candidate@test.com",
) -> str:
    r = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": email},
    )
    return r.json()["token"]  # type: ignore[no-any-return]


async def test_candidate_accepts_invitation(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id = await _create_org_and_link(client, recruiter_headers)
    token = await _create_invite_token(client, recruiter_headers, org_id)
    r = await client.post(f"/invitations/{token}/accept", headers=candidate_headers)
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "active"
    assert data["organization_id"] == org_id


async def test_accept_is_idempotent(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id = await _create_org_and_link(client, recruiter_headers)
    token = await _create_invite_token(client, recruiter_headers, org_id)
    r1 = await client.post(f"/invitations/{token}/accept", headers=candidate_headers)
    # Second invite to same org
    token2 = await _create_invite_token(client, recruiter_headers, org_id)
    r2 = await client.post(f"/invitations/{token2}/accept", headers=candidate_headers)
    assert r1.json()["id"] == r2.json()["id"]  # same grant returned


async def test_candidate_rejects_invitation(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id = await _create_org_and_link(client, recruiter_headers)
    token = await _create_invite_token(client, recruiter_headers, org_id)
    r = await client.post(f"/invitations/{token}/reject", headers=candidate_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "rejected"


async def test_cannot_accept_already_rejected(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id = await _create_org_and_link(client, recruiter_headers)
    token = await _create_invite_token(client, recruiter_headers, org_id)
    await client.post(f"/invitations/{token}/reject", headers=candidate_headers)
    r = await client.post(f"/invitations/{token}/accept", headers=candidate_headers)
    assert r.status_code == 409


async def test_accept_unknown_token_returns_404(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post("/invitations/doesnotexist/accept", headers=candidate_headers)
    assert r.status_code == 404


# ---- access grants ----------------------------------------------------------


async def test_candidate_lists_grants(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id = await _create_org_and_link(client, recruiter_headers)
    token = await _create_invite_token(client, recruiter_headers, org_id)
    await client.post(f"/invitations/{token}/accept", headers=candidate_headers)
    r = await client.get("/access/me", headers=candidate_headers)
    assert r.status_code == 200
    grants = r.json()
    assert any(g["organization_id"] == org_id for g in grants)


async def test_candidate_revokes_grant(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id = await _create_org_and_link(client, recruiter_headers)
    token = await _create_invite_token(client, recruiter_headers, org_id)
    grant = await client.post(f"/invitations/{token}/accept", headers=candidate_headers)
    grant_id = grant.json()["id"]
    r = await client.delete(f"/access/me/{grant_id}", headers=candidate_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "revoked"
    assert r.json()["revoked_at"] is not None
```

- [ ] **Step 2: Verify tests fail (routes don't exist yet)**

```bash
pytest tests/integration/test_access_flow.py -v --tb=line 2>&1 | tail -5
```

Expected: most tests fail with 404 or connection error (routes not implemented).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/integration/test_access_flow.py
git commit -m "test(backend): add failing integration tests for invitation/access flow"
```

---

## Task 5: API Routes + `main.py`

**Files:**
- Create: `backend/api/routes/invitations.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create `backend/api/routes/invitations.py`**

```python
# backend/api/routes/invitations.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import services.invitation_service as invitation_service
import services.recruiter_service as recruiter_service
from api.deps import get_db, require_role
from models.invitation import AccessGrant, Invitation, InvitationStatus
from models.user import User, UserRole
from schemas.invitation import AccessGrantRead, InvitationCreate, InvitationRead

router = APIRouter(tags=["invitations"])

RecruiterUser = Annotated[User, Depends(require_role(UserRole.RECRUITER))]
CandidateUser = Annotated[User, Depends(require_role(UserRole.CANDIDATE))]
DB = Annotated[AsyncSession, Depends(get_db)]


# ---- Recruiter: create invitation -------------------------------------------


@router.post(
    "/organizations/{org_id}/invitations",
    response_model=InvitationRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_invitation(
    org_id: UUID,
    data: InvitationCreate,
    current_user: RecruiterUser,
    db: DB,
) -> Invitation:
    profile = await recruiter_service.get_or_create_profile(db, current_user.id)
    if profile.organization_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="you do not belong to this organization",
        )
    return await invitation_service.create_invitation(
        db, current_user.id, org_id, str(data.candidate_email)
    )


# ---- Candidate: view + respond to invitations -------------------------------


@router.get("/invitations/me", response_model=list[InvitationRead])
async def list_my_invitations(
    current_user: CandidateUser, db: DB
) -> list[Invitation]:
    return await invitation_service.list_candidate_invitations(
        db, current_user.email, current_user.id
    )


@router.post(
    "/invitations/{token}/accept",
    response_model=AccessGrantRead,
    status_code=status.HTTP_201_CREATED,
)
async def accept_invitation(
    token: str, current_user: CandidateUser, db: DB
) -> AccessGrant:
    invitation = await invitation_service.get_invitation_by_token(db, token)
    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="invitation not found"
        )
    if invitation.status != InvitationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"invitation is {invitation.status.value}",
        )
    try:
        return await invitation_service.accept_invitation(db, invitation, current_user.id)
    except ValueError as e:
        if str(e) == "invitation_expired":
            raise HTTPException(
                status_code=status.HTTP_410_GONE, detail="invitation has expired"
            ) from e
        raise


@router.post("/invitations/{token}/reject", response_model=InvitationRead)
async def reject_invitation(
    token: str, current_user: CandidateUser, db: DB
) -> Invitation:
    invitation = await invitation_service.get_invitation_by_token(db, token)
    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="invitation not found"
        )
    if invitation.status != InvitationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"invitation is {invitation.status.value}",
        )
    return await invitation_service.reject_invitation(db, invitation)


# ---- Candidate: access grants -----------------------------------------------


@router.get("/access/me", response_model=list[AccessGrantRead])
async def list_my_grants(
    current_user: CandidateUser, db: DB
) -> list[AccessGrant]:
    return await invitation_service.list_candidate_grants(db, current_user.id)


@router.delete("/access/me/{grant_id}", response_model=AccessGrantRead)
async def revoke_grant(
    grant_id: UUID, current_user: CandidateUser, db: DB
) -> AccessGrant:
    result = await db.execute(
        select(AccessGrant).where(
            AccessGrant.id == grant_id,
            AccessGrant.candidate_id == current_user.id,
        )
    )
    grant = result.scalar_one_or_none()
    if grant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="access grant not found"
        )
    return await invitation_service.revoke_grant(db, grant)
```

- [ ] **Step 2: Update `backend/main.py`**

```python
# backend/main.py
from fastapi import FastAPI

from api.routes.auth import router as auth_router
from api.routes.candidates import router as candidates_router
from api.routes.invitations import router as invitations_router
from api.routes.organizations import router as organizations_router
from api.routes.recruiters import router as recruiters_router
from core.config import get_settings

settings = get_settings()

app = FastAPI(title="Jorg API", version="0.1.0")
app.include_router(auth_router)
app.include_router(candidates_router)
app.include_router(organizations_router)
app.include_router(recruiters_router)
app.include_router(invitations_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.env}
```

- [ ] **Step 3: Commit**

```bash
git add backend/api/routes/invitations.py backend/main.py
git commit -m "feat(backend): add /invitations and /access REST endpoints"
```

---

## Task 6: Verify Tests Green

**Files:** fixes as needed

- [ ] **Step 1: Run invitation tests**

```bash
pytest tests/integration/test_access_flow.py -v
```

Expected: all tests pass. Common failures and fixes:

- `assert "token" not in data` fails → the `InvitationRead` schema exposes the token field. Fix: add `token: str` to `InvitationRead` (tests need it in `_create_invite_token`). The test `test_recruiter_creates_invitation` checks `"token" not in data` — **remove that assertion** (token IS exposed in the response so the candidate can use the link).
- `409` instead of `201` on idempotent accept → verify `accept_invitation` returns the existing grant correctly.
- `expires_at` timezone comparison → `invitation.expires_at` is stored timezone-aware by Postgres. The `replace(tzinfo=UTC)` in `accept_invitation` handles naive datetimes; if Postgres returns tz-aware, use `invitation.expires_at.astimezone(UTC)` instead.

**Fix for token in schema** — update `InvitationRead` in `backend/schemas/invitation.py`:

```python
class InvitationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    recruiter_id: UUID
    organization_id: UUID
    candidate_email: str
    candidate_id: UUID | None
    token: str          # ← add this
    status: InvitationStatus
    expires_at: datetime
    created_at: datetime
```

**Fix for expires_at comparison** — update `accept_invitation` in `backend/services/invitation_service.py`:

```python
    now = datetime.now(UTC)
    expires = invitation.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < now:
        invitation.status = InvitationStatus.EXPIRED
        await db.commit()
        raise ValueError("invitation_expired")
```

- [ ] **Step 2: Run full suite**

```bash
pytest -v
```

Expected: all tests pass (69 previous + new invitation tests).

---

## Task 7: Lint + Mypy + Final Commit

**Files:** corrections as needed

- [ ] **Step 1: Ruff**

```bash
ruff check . --fix && ruff format .
```

Expected: `All checks passed!`

- [ ] **Step 2: Mypy**

```bash
mypy .
```

Expected: `Success: no issues found in N source files`

Common mypy issues:
- `Returning Any from function` on `_create_invite_token` in tests → add `-> str` and cast: `return str(r.json()["token"])`
- `error: Unused "type: ignore"` → remove stale comments

- [ ] **Step 3: Final test run**

```bash
pytest -v && echo "ALL PASS"
```

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "fix(backend): ruff and mypy cleanup for plan 4"
```
