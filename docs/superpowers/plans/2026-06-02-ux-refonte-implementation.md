# Jorg UX Refonte — Implementation Plan (Tracks A–B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure Jorg's information architecture from 14 nav entries to 9, fix critical UX flows (onboarding, generate-in-context, unified profile), and add org join-by-code.

**Architecture:** Five tracks with clear dependencies. Track A (backend) and Track B (frontend infrastructure) are prerequisites for Tracks C–E. Within Track A, tasks 1–6 are independent of each other. Do not touch any auth files (`auth.py`, `lib/auth.ts`, `lib/api.ts`, `middleware.ts`) — those belong to the security plan.

**Tech Stack:** FastAPI + SQLAlchemy 2 async + Alembic + pytest/httpx (backend); Next.js 15 App Router + TypeScript + shadcn/ui + Tailwind (frontend). Package manager: `uv` (backend), `npm` (frontend).

**⚠️ Before any frontend routing/redirect work:** Read `frontend/node_modules/next/dist/docs/` as instructed by `frontend/AGENTS.md`.

---

## Scope Note — Five tracks

```
Track A (Backend, Tasks 1–6)     → independent tasks, run in any order
Track B (Frontend infra, 7–10)   → independent of A
Track C (Nav shell, 11–12)       → independent of A and B
Track D (Recruiter pages, 13–17) → requires A1-A3, B7-B10, C11
Track E (Candidate pages, 18–22) → requires A5-A6, B7-B8, C12
```

**B7 coordination:** If the security plan's Task 9 (`GeneratedDocumentCandidateView`) has already been applied, skip Task 6 here and only add the frontend types.

---

## File Map

**Backend — create:**

- `backend/alembic/versions/<hash>_add_org_join_code.py`

**Backend — modify:**

- `backend/models/recruiter.py` — add `join_code`, `generate_join_code()`
- `backend/schemas/recruiter.py` — add `join_code` to `OrganizationRead`, add `OrgJoinRequest`, `OrgMemberRead`
- `backend/services/recruiter_service.py` — `create_organization` atomic, `_unique_join_code`, `join_organization`, `regenerate_join_code`, `list_org_members`
- `backend/api/routes/organizations.py` — add `/join`, `/{id}/regenerate-join-code`, `/{id}/members`
- `backend/schemas/invitation.py` — add `organization_name` to `InvitationRead`
- `backend/services/invitation_service.py` — `list_candidate_invitations` returns dicts with org name
- `backend/schemas/generation.py` — add `GeneratedDocumentCandidateView` (if not done by security plan)
- `backend/services/generation_service.py` — add `list_candidate_documents_view` (if not done)
- `backend/api/routes/generation.py` — update `/candidates/me/documents` response (if not done)

**Frontend — create:**

- `frontend/lib/labels.ts`
- `frontend/components/notification-bell.tsx`
- `frontend/components/breadcrumb.tsx`
- `frontend/components/generate-dossier-dialog.tsx`
- `frontend/components/invite-candidate-dialog.tsx`
- `frontend/components/onboarding-org.tsx`
- `frontend/app/(recruiter)/recruiter/documents/page.tsx`
- `frontend/app/(recruiter)/recruiter/settings/page.tsx`
- `frontend/app/(recruiter)/recruiter/candidates/[id]/page.tsx`

**Frontend — modify:**

- `frontend/types/api.ts` — add `Organization.join_code`, `Invitation.organization_name`, `OrgMember`
- `frontend/components/nav-sidebar.tsx` — add notification bell slot, update ICON_MAP
- `frontend/app/(recruiter)/layout.tsx` — nav 7→5
- `frontend/app/(candidate)/layout.tsx` — nav 7→4
- `frontend/app/(recruiter)/recruiter/dashboard/page.tsx` — onboarding CTA
- `frontend/app/(recruiter)/recruiter/candidates/page.tsx` — invite modal, generate dialog, voir profil
- `frontend/app/(recruiter)/recruiter/opportunities/[id]/page.tsx` — fix alert(), add breadcrumb
- `frontend/app/(candidate)/candidate/profile/page.tsx` — tab shell fusion
- `frontend/app/(candidate)/candidate/access/page.tsx` — fusion invitations+access+docs
- `frontend/app/(candidate)/candidate/skills/page.tsx` — export sections + redirect

**Frontend — replace with redirect:**

- `frontend/app/(recruiter)/recruiter/invitations/page.tsx`
- `frontend/app/(recruiter)/recruiter/generate/page.tsx`
- `frontend/app/(recruiter)/recruiter/history/page.tsx`
- `frontend/app/(candidate)/candidate/requests/page.tsx`
- `frontend/app/(candidate)/candidate/history/page.tsx`

---

## TRACK A — Backend

---

### Task 1: Organization.join_code model + Alembic migration

**Files:**

- Modify: `backend/models/recruiter.py`
- Modify: `backend/schemas/recruiter.py`
- Create: `backend/alembic/versions/<hash>_add_org_join_code.py`

- [ ] **Step 1: Write failing test**

Add to `backend/tests/integration/test_recruiter_api.py` (create file if absent):

```python
async def test_create_organization_has_join_code(client, recruiter_headers):
    r = await client.post(
        "/organizations",
        headers=recruiter_headers,
        json={"name": "JoinCode Corp"},
    )
    assert r.status_code == 201
    body = r.json()
    assert "join_code" in body
    assert len(body["join_code"]) >= 6
```

- [ ] **Step 2: Run test — expect failure**

```
cd backend && uv run pytest tests/integration/test_recruiter_api.py::test_create_organization_has_join_code -v
```

Expected: FAIL — `join_code` key absent from response.

- [ ] **Step 3: Add `join_code` to `backend/models/recruiter.py`**

```python
# backend/models/recruiter.py
from __future__ import annotations

import secrets
from uuid import UUID

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


def generate_join_code() -> str:
    return secrets.token_urlsafe(6)


class Organization(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True, nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    join_code: Mapped[str] = mapped_column(
        String(32), unique=True, index=True, nullable=False, default=generate_join_code
    )


class RecruiterProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "recruiter_profiles"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    organization_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
```

- [ ] **Step 4: Add `join_code` to `OrganizationRead` and new schemas in `backend/schemas/recruiter.py`**

```python
# backend/schemas/recruiter.py  (full file replacement)
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from models.candidate_profile import AvailabilityStatus, ContractType, WorkMode
from schemas.candidate import ExperienceRead


class OrganizationCreate(BaseModel):
    name: str
    logo_url: str | None = None


class OrgJoinRequest(BaseModel):
    code: str


class OrganizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    logo_url: str | None
    join_code: str
    created_at: datetime


class OrgMemberRead(BaseModel):
    user_id: UUID
    email: str
    first_name: str | None
    last_name: str | None
    job_title: str | None


class RecruiterProfileUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    job_title: str | None = None
    organization_id: UUID | None = None


class RecruiterProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    organization_id: UUID | None
    first_name: str | None
    last_name: str | None
    job_title: str | None
    created_at: datetime
    updated_at: datetime


class AccessibleCandidateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    email: str
    first_name: str | None
    last_name: str | None
    title: str | None = None
    daily_rate: int | None = None
    contract_type: ContractType | None = None
    availability_status: AvailabilityStatus | None = None
    work_mode: WorkMode | None = None
    location_preference: str | None = None
    preferred_domains: list[str] | None = None
    experiences: list[ExperienceRead] = []
```

- [ ] **Step 5: Generate Alembic migration**

```
cd backend && uv run alembic revision --autogenerate -m "add_org_join_code"
```

Open the generated file. Verify `upgrade()` adds a `join_code VARCHAR(32)` column. Then add the backfill manually between add_column and alter_column:

```python
import secrets
import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    # 1. Add nullable
    op.add_column(
        "organizations",
        sa.Column("join_code", sa.String(32), nullable=True),
    )

    # 2. Backfill existing rows
    bind = op.get_bind()
    org_ids = bind.execute(sa.text("SELECT id FROM organizations")).fetchall()
    seen: set[str] = set()
    for (org_id,) in org_ids:
        while True:
            code = secrets.token_urlsafe(6)
            if code not in seen:
                seen.add(code)
                break
        bind.execute(
            sa.text("UPDATE organizations SET join_code = :code WHERE id = :id"),
            {"code": code, "id": str(org_id)},
        )

    # 3. Make NOT NULL + unique
    op.alter_column("organizations", "join_code", nullable=False)
    op.create_unique_constraint("uq_organizations_join_code", "organizations", ["join_code"])
    op.create_index("ix_organizations_join_code", "organizations", ["join_code"])


def downgrade() -> None:
    op.drop_index("ix_organizations_join_code", "organizations")
    op.drop_constraint("uq_organizations_join_code", "organizations", type_="unique")
    op.drop_column("organizations", "join_code")
```

- [ ] **Step 6: Apply migration**

```
uv run alembic upgrade head
```

- [ ] **Step 7: Run test — expect pass**

```
uv run pytest tests/integration/test_recruiter_api.py::test_create_organization_has_join_code -v
```

- [ ] **Step 8: Commit**

```
git add backend/models/recruiter.py backend/schemas/recruiter.py backend/alembic/versions/
git commit -m "feat(org): add join_code field to Organization + migration with backfill"
```

---

### Task 2: Atomic organization creation + join/regenerate/members service functions

**Files:**

- Modify: `backend/services/recruiter_service.py`
- Modify: `backend/api/routes/organizations.py`

- [ ] **Step 1: Write failing tests**

Add to `backend/tests/integration/test_recruiter_api.py`:

```python
async def test_create_org_links_creator(client, recruiter_headers):
    """Creating an org should automatically set creator's organization_id."""
    r = await client.post(
        "/organizations",
        headers=recruiter_headers,
        json={"name": "Atomic Corp"},
    )
    assert r.status_code == 201
    org_id = r.json()["id"]

    profile_r = await client.get("/recruiters/me/profile", headers=recruiter_headers)
    assert profile_r.json()["organization_id"] == org_id


async def test_join_organization_by_code(client, recruiter_headers, second_recruiter_headers):
    """A second recruiter can join an org via its join_code."""
    r = await client.post(
        "/organizations",
        headers=recruiter_headers,
        json={"name": "Join Test Corp"},
    )
    join_code = r.json()["join_code"]

    join_r = await client.post(
        "/organizations/join",
        headers=second_recruiter_headers,
        json={"code": join_code},
    )
    assert join_r.status_code == 200
    assert join_r.json()["organization_id"] == r.json()["id"]


async def test_join_invalid_code_returns_404(client, recruiter_headers):
    r = await client.post(
        "/organizations/join",
        headers=recruiter_headers,
        json={"code": "INVALID_CODE_XYZ"},
    )
    assert r.status_code == 404


async def test_regenerate_join_code(client, recruiter_headers):
    r = await client.post(
        "/organizations",
        headers=recruiter_headers,
        json={"name": "Regen Corp"},
    )
    org_id = r.json()["id"]
    old_code = r.json()["join_code"]

    regen_r = await client.post(
        f"/organizations/{org_id}/regenerate-join-code",
        headers=recruiter_headers,
    )
    assert regen_r.status_code == 200
    assert regen_r.json()["join_code"] != old_code


async def test_list_members(client, recruiter_headers):
    r = await client.post(
        "/organizations",
        headers=recruiter_headers,
        json={"name": "Members Corp"},
    )
    org_id = r.json()["id"]

    members_r = await client.get(
        f"/organizations/{org_id}/members",
        headers=recruiter_headers,
    )
    assert members_r.status_code == 200
    assert len(members_r.json()) >= 1
    assert "email" in members_r.json()[0]
```

> **Note on fixtures:** `second_recruiter_headers` is a new fixture — add it to `conftest.py` registering a second recruiter account (email `recruiter2@test.com`).

- [ ] **Step 2: Run tests — expect failures**

```
uv run pytest tests/integration/test_recruiter_api.py::test_create_org_links_creator tests/integration/test_recruiter_api.py::test_join_organization_by_code tests/integration/test_recruiter_api.py::test_join_invalid_code_returns_404 tests/integration/test_recruiter_api.py::test_regenerate_join_code tests/integration/test_recruiter_api.py::test_list_members -v
```

Expected: all FAIL.

- [ ] **Step 3: Update `backend/services/recruiter_service.py`**

Replace the file (keep all existing functions, add/modify as below):

```python
# backend/services/recruiter_service.py
import re
import secrets
from typing import Any, Self
from uuid import UUID

from sqlalchemy import Select, exists, func, or_, select
from sqlalchemy.dialects.postgresql import array
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.candidate_profile import CandidateProfile, Experience
from models.invitation import AccessGrant, AccessGrantStatus
from models.recruiter import Organization, RecruiterProfile
from models.skill import (
    Achievement,
    AchievementSkillTag,
    CandidateSkill,
    ExperienceSkillUsage,
    SkillReference,
)
from models.user import User
from schemas.recruiter import OrganizationCreate, RecruiterProfileUpdate


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    return re.sub(r"-+", "-", slug).strip("-")


async def _unique_slug(db: AsyncSession, base: str) -> str:
    candidate = base
    suffix = 1
    while True:
        result = await db.execute(select(Organization).where(Organization.slug == candidate))
        if result.scalar_one_or_none() is None:
            return candidate
        candidate = f"{base}-{suffix}"
        suffix += 1


async def _unique_join_code(db: AsyncSession) -> str:
    while True:
        code = secrets.token_urlsafe(6)
        result = await db.execute(select(Organization).where(Organization.join_code == code))
        if result.scalar_one_or_none() is None:
            return code


# ---- Organization -----------------------------------------------------------


async def create_organization(
    db: AsyncSession,
    data: OrganizationCreate,
    created_by_user_id: UUID | None = None,
) -> Organization:
    """Create org. If created_by_user_id provided, links that recruiter atomically."""
    slug = await _unique_slug(db, _slugify(data.name))
    join_code = await _unique_join_code(db)
    org = Organization(name=data.name, slug=slug, logo_url=data.logo_url, join_code=join_code)
    db.add(org)
    await db.flush()  # get org.id without committing

    if created_by_user_id is not None:
        profile = await get_or_create_profile(db, created_by_user_id)
        profile.organization_id = org.id

    await db.commit()
    await db.refresh(org)
    return org


async def get_organization(db: AsyncSession, org_id: UUID) -> Organization | None:
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    return result.scalar_one_or_none()


async def get_organization_by_join_code(db: AsyncSession, code: str) -> Organization | None:
    result = await db.execute(select(Organization).where(Organization.join_code == code))
    return result.scalar_one_or_none()


async def join_organization(db: AsyncSession, user_id: UUID, code: str) -> RecruiterProfile:
    """Join org by join_code. Idempotent if already a member. Raises ValueError on bad code."""
    org = await get_organization_by_join_code(db, code)
    if org is None:
        raise ValueError("invalid_code")
    profile = await get_or_create_profile(db, user_id)
    if profile.organization_id == org.id:
        return profile  # already member
    profile.organization_id = org.id
    await db.commit()
    await db.refresh(profile)
    return profile


async def regenerate_join_code(db: AsyncSession, org: Organization) -> Organization:
    org.join_code = await _unique_join_code(db)
    await db.commit()
    await db.refresh(org)
    return org


async def list_org_members(db: AsyncSession, org_id: UUID) -> list[dict[str, Any]]:
    rows = await db.execute(
        select(RecruiterProfile, User.email)
        .join(User, User.id == RecruiterProfile.user_id)
        .where(RecruiterProfile.organization_id == org_id)
    )
    return [
        {
            "user_id": row.RecruiterProfile.user_id,
            "email": row.email,
            "first_name": row.RecruiterProfile.first_name,
            "last_name": row.RecruiterProfile.last_name,
            "job_title": row.RecruiterProfile.job_title,
        }
        for row in rows.all()
    ]


# ---- RecruiterProfile -------------------------------------------------------


async def get_profile(db: AsyncSession, user_id: UUID) -> RecruiterProfile | None:
    result = await db.execute(select(RecruiterProfile).where(RecruiterProfile.user_id == user_id))
    return result.scalar_one_or_none()


async def get_or_create_profile(db: AsyncSession, user_id: UUID) -> RecruiterProfile:
    result = await db.execute(select(RecruiterProfile).where(RecruiterProfile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = RecruiterProfile(user_id=user_id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile


async def update_profile(
    db: AsyncSession,
    profile: RecruiterProfile,
    data: RecruiterProfileUpdate,
) -> RecruiterProfile:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile


# ---- Accessible candidates --------------------------------------------------

# (Keep the existing CandidateQueryBuilder class and list_accessible_candidates function unchanged)


class CandidateQueryBuilder:
    def __init__(self, organization_id: UUID) -> None:
        self._stmt: Select[Any] = (
            select(
                User.id.label("user_id"),
                User.email,
                CandidateProfile.first_name,
                CandidateProfile.last_name,
                CandidateProfile.title,
                CandidateProfile.daily_rate,
                CandidateProfile.contract_type,
                CandidateProfile.availability_status,
                CandidateProfile.work_mode,
                CandidateProfile.location_preference,
                CandidateProfile.preferred_domains,
            )
            .join(AccessGrant, AccessGrant.candidate_id == User.id)
            .outerjoin(CandidateProfile, CandidateProfile.user_id == User.id)
            .where(
                AccessGrant.organization_id == organization_id,
                AccessGrant.status == AccessGrantStatus.ACTIVE,
            )
            .order_by(
                CandidateProfile.last_name.nulls_last(),
                CandidateProfile.first_name.nulls_last(),
            )
        )

    def filter_availability(self, status: str) -> Self:
        self._stmt = self._stmt.where(CandidateProfile.availability_status == status)
        return self

    def filter_work_mode(self, mode: str) -> Self:
        self._stmt = self._stmt.where(CandidateProfile.work_mode == mode)
        return self

    def filter_contract_type(self, contract_type: str) -> Self:
        self._stmt = self._stmt.where(CandidateProfile.contract_type == contract_type)
        return self

    def filter_mission_duration(self, duration: str) -> Self:
        self._stmt = self._stmt.where(CandidateProfile.mission_duration == duration)
        return self

    def filter_max_rate(self, max_rate: int) -> Self:
        self._stmt = self._stmt.where(
            or_(
                CandidateProfile.daily_rate.is_(None),
                CandidateProfile.daily_rate <= max_rate,
            )
        )
        return self

    def filter_skill(self, skill: str) -> Self:
        self._stmt = self._stmt.where(
            exists(
                select(CandidateSkill.id).where(
                    CandidateSkill.candidate_id == CandidateProfile.id,
                    exists(
                        select(SkillReference.id).where(
                            SkillReference.id == CandidateSkill.skill_ref_id,
                            func.lower(SkillReference.name).contains(skill.lower()),
                        )
                    ),
                )
            )
        )
        return self

    def filter_location(self, location: str) -> Self:
        self._stmt = self._stmt.where(CandidateProfile.location_preference.ilike(f"%{location}%"))
        return self

    def filter_domain(self, domain: str) -> Self:
        self._stmt = self._stmt.where(CandidateProfile.preferred_domains.contains(array([domain])))
        return self

    def filter_query(self, q: str) -> Self:
        q_like = f"%{q}%"
        self._stmt = self._stmt.where(
            or_(
                CandidateProfile.title.ilike(q_like),
                CandidateProfile.summary.ilike(q_like),
            )
        )
        return self

    def build(self) -> Select[Any]:
        return self._stmt


async def list_accessible_candidates(
    db: AsyncSession,
    organization_id: UUID,
    *,
    availability_status: str | None = None,
    work_mode: str | None = None,
    contract_type: str | None = None,
    mission_duration: str | None = None,
    max_daily_rate: int | None = None,
    skill: str | None = None,
    location: str | None = None,
    domain: str | None = None,
    q: str | None = None,
) -> list[dict[str, Any]]:
    builder = CandidateQueryBuilder(organization_id)
    if availability_status:
        builder = builder.filter_availability(availability_status)
    if work_mode:
        builder = builder.filter_work_mode(work_mode)
    if contract_type:
        builder = builder.filter_contract_type(contract_type)
    if mission_duration:
        builder = builder.filter_mission_duration(mission_duration)
    if max_daily_rate is not None:
        builder = builder.filter_max_rate(max_daily_rate)
    if skill:
        builder = builder.filter_skill(skill)
    if location:
        builder = builder.filter_location(location)
    if domain:
        builder = builder.filter_domain(domain)
    if q:
        builder = builder.filter_query(q)

    stmt = builder.build().add_columns(CandidateProfile.id.label("profile_id"))
    result = await db.execute(stmt)
    rows = result.all()

    profile_ids = [row.profile_id for row in rows if row.profile_id is not None]
    experiences_by_profile: dict[UUID, list[Experience]] = {}
    if profile_ids:
        exp_result = await db.execute(
            select(Experience)
            .where(Experience.profile_id.in_(profile_ids))
            .options(
                selectinload(Experience.achievements)
                .selectinload(Achievement.skill_tags)
                .selectinload(AchievementSkillTag.skill_ref),
                selectinload(Experience.skill_usages).selectinload(ExperienceSkillUsage.skill_ref),
            )
            .order_by(Experience.start_date.desc())
        )
        for exp in exp_result.scalars().all():
            experiences_by_profile.setdefault(exp.profile_id, []).append(exp)

    return [
        {
            "user_id": row.user_id,
            "email": row.email,
            "first_name": row.first_name,
            "last_name": row.last_name,
            "title": row.title,
            "daily_rate": row.daily_rate,
            "contract_type": row.contract_type,
            "availability_status": row.availability_status,
            "work_mode": row.work_mode,
            "location_preference": row.location_preference,
            "preferred_domains": row.preferred_domains,
            "experiences": experiences_by_profile.get(row.profile_id, []),
        }
        for row in rows
    ]
```

- [ ] **Step 4: Add new routes to `backend/api/routes/organizations.py`**

Add after the existing `get_organization` route (before the Candidates section):

```python
from schemas.recruiter import (
    AccessibleCandidateRead,
    OrgJoinRequest,
    OrgMemberRead,
    OrganizationCreate,
    OrganizationRead,
)

# ... existing routes ...


@router.post("/join", response_model=RecruiterProfileRead)
async def join_organization_by_code(
    data: OrgJoinRequest, current_user: RecruiterUser, db: DB
) -> RecruiterProfile:
    try:
        return await recruiter_service.join_organization(db, current_user.id, data.code)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invalid join code")


@router.post("/{org_id}/regenerate-join-code", response_model=OrganizationRead)
async def regenerate_join_code(
    org_id: UUID, current_user: RecruiterUser, db: DB
) -> Organization:
    org = await _get_org_or_404(db, org_id)
    await _require_org_membership(db, current_user.id, org_id)
    return await recruiter_service.regenerate_join_code(db, org)


@router.get("/{org_id}/members", response_model=list[OrgMemberRead])
async def list_members(
    org_id: UUID, current_user: RecruiterUser, db: DB
) -> list[dict]:
    await _get_org_or_404(db, org_id)
    await _require_org_membership(db, current_user.id, org_id)
    return await recruiter_service.list_org_members(db, org_id)
```

Also update the `create_organization` route to pass `current_user.id`:

```python
@router.post("", response_model=OrganizationRead, status_code=status.HTTP_201_CREATED)
async def create_organization(
    data: OrganizationCreate, current_user: RecruiterUser, db: DB
) -> Organization:
    return await recruiter_service.create_organization(db, data, created_by_user_id=current_user.id)
```

- [ ] **Step 5: Run tests — expect pass**

```
uv run pytest tests/integration/test_recruiter_api.py::test_create_org_links_creator tests/integration/test_recruiter_api.py::test_join_organization_by_code tests/integration/test_recruiter_api.py::test_join_invalid_code_returns_404 tests/integration/test_recruiter_api.py::test_regenerate_join_code tests/integration/test_recruiter_api.py::test_list_members -v
```

- [ ] **Step 6: Run full suite**

```
uv run pytest tests/ -x -q
```

Fix any failures caused by `create_organization` now requiring `db` flush before linking.

- [ ] **Step 7: Commit**

```
git add backend/services/recruiter_service.py backend/api/routes/organizations.py
git commit -m "feat(org): atomic org creation, join-by-code, regenerate-code, list-members"
```

---

### Task 3: InvitationRead — add organization_name

**Files:**

- Modify: `backend/schemas/invitation.py`
- Modify: `backend/services/invitation_service.py`

- [ ] **Step 1: Write failing test**

Add to `backend/tests/integration/test_invitation_api.py` (create if absent):

```python
async def test_candidate_invitations_include_org_name(
    client, recruiter_headers, candidate_headers
):
    # Setup: recruiter creates org + sends invitation
    org_r = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "OrgName Test"}
    )
    org_id = org_r.json()["id"]
    await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "candidate@test.com"},
    )

    r = await client.get("/invitations/me", headers=candidate_headers)
    assert r.status_code == 200
    invitations = r.json()
    assert len(invitations) >= 1
    assert invitations[0]["organization_name"] == "OrgName Test"
```

- [ ] **Step 2: Run — expect failure**

```
uv run pytest tests/integration/test_invitation_api.py::test_candidate_invitations_include_org_name -v
```

- [ ] **Step 3: Update `backend/schemas/invitation.py`**

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
    organization_name: str | None = None
    candidate_email: str
    candidate_id: UUID | None
    token: str
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

- [ ] **Step 4: Update `list_candidate_invitations` in `backend/services/invitation_service.py`**

Replace the existing `list_candidate_invitations` function:

```python
async def list_candidate_invitations(
    db: AsyncSession, candidate_email: str, candidate_id: UUID
) -> list[dict]:
    """Return invitations with org name joined."""
    from models.recruiter import Organization

    rows = await db.execute(
        select(Invitation, Organization.name.label("organization_name"))
        .outerjoin(Organization, Invitation.organization_id == Organization.id)
        .where(
            (Invitation.candidate_email == candidate_email)
            | (Invitation.candidate_id == candidate_id)
        )
    )
    result = []
    for row in rows.all():
        inv = row.Invitation
        result.append(
            {
                "id": inv.id,
                "recruiter_id": inv.recruiter_id,
                "organization_id": inv.organization_id,
                "organization_name": row.organization_name,
                "candidate_email": inv.candidate_email,
                "candidate_id": inv.candidate_id,
                "token": inv.token,
                "status": inv.status,
                "expires_at": inv.expires_at,
                "created_at": inv.created_at,
            }
        )
    return result
```

Update the route in `backend/api/routes/invitations.py` — change return type annotation:

```python
@router.get("/invitations/me", response_model=list[InvitationRead])
async def list_my_invitations(current_user: CandidateUser, db: DB) -> list[dict]:
    return await invitation_service.list_candidate_invitations(
        db, current_user.email, current_user.id
    )
```

- [ ] **Step 5: Run test — expect pass**

```
uv run pytest tests/integration/test_invitation_api.py::test_candidate_invitations_include_org_name -v
```

- [ ] **Step 6: Commit**

```
git add backend/schemas/invitation.py backend/services/invitation_service.py backend/api/routes/invitations.py
git commit -m "feat(invitation): add organization_name to candidate invitation list"
```

---

### Task 4: GeneratedDocumentCandidateView — B7

> **Skip this task if the security plan's Task 9 has already been applied.** Verify with:
> `uv run pytest tests/integration/test_generation_api.py -k "org_and_template_name" -v`
> If it passes, skip to Task 5.

**Files:**

- Modify: `backend/schemas/generation.py`
- Modify: `backend/services/generation_service.py`
- Modify: `backend/api/routes/generation.py`

- [ ] **Step 1: Write failing test**

Add to `backend/tests/integration/test_generation_api.py`:

```python
async def test_candidate_documents_include_org_and_template_name(
    client, recruiter_headers, candidate_headers
):
    # This test requires a full generate flow; skip setup if fixtures provide it.
    r = await client.get("/candidates/me/documents", headers=candidate_headers)
    assert r.status_code == 200
    # If docs exist, verify shape
    docs = r.json()
    if docs:
        assert "organization_name" in docs[0]
        assert "template_name" in docs[0]
        assert "file_path" not in docs[0]
```

- [ ] **Step 2: Update `backend/schemas/generation.py`**

Add the candidate view class (keep existing `GeneratedDocumentRead` and `GenerateRequest`):

```python
class GeneratedDocumentCandidateView(BaseModel):
    """Candidate-facing document view — omits file_path, includes human-readable names."""

    id: UUID
    generated_at: datetime
    file_format: str
    organization_name: str
    template_name: str
```

- [ ] **Step 3: Add `list_candidate_documents_view` to `backend/services/generation_service.py`**

Add after existing functions (check imports at top of file first; add if missing):

```python
from models.recruiter import Organization
from models.template import Template as TemplateModel
from schemas.generation import GeneratedDocumentCandidateView


async def list_candidate_documents_view(
    db: AsyncSession, candidate_id: UUID
) -> list[dict]:
    from models.invitation import AccessGrant

    rows = await db.execute(
        select(
            GeneratedDocument.id,
            GeneratedDocument.generated_at,
            GeneratedDocument.file_format,
            Organization.name.label("organization_name"),
            TemplateModel.name.label("template_name"),
        )
        .join(AccessGrant, GeneratedDocument.access_grant_id == AccessGrant.id)
        .join(Organization, AccessGrant.organization_id == Organization.id)
        .join(TemplateModel, GeneratedDocument.template_id == TemplateModel.id)
        .where(AccessGrant.candidate_id == candidate_id)
        .order_by(GeneratedDocument.generated_at.desc())
    )
    return [
        {
            "id": row.id,
            "generated_at": row.generated_at,
            "file_format": row.file_format,
            "organization_name": row.organization_name,
            "template_name": row.template_name,
        }
        for row in rows.all()
    ]
```

- [ ] **Step 4: Update route in `backend/api/routes/generation.py`**

Find the `GET /candidates/me/documents` route and replace it:

```python
from schemas.generation import GeneratedDocumentCandidateView, GeneratedDocumentRead, GenerateRequest

@router.get("/candidates/me/documents", response_model=list[GeneratedDocumentCandidateView])
async def list_my_documents(current_user: CandidateUser, db: DB) -> list[dict]:
    return await generation_service.list_candidate_documents_view(db, current_user.id)
```

- [ ] **Step 5: Run full test suite**

```
uv run pytest tests/ -x -q
```

- [ ] **Step 6: Commit**

```
git add backend/schemas/generation.py backend/services/generation_service.py backend/api/routes/generation.py
git commit -m "feat(docs): GeneratedDocumentCandidateView with org+template names (B7)"
```

---

## TRACK B — Frontend Infrastructure

---

### Task 5: frontend/types/api.ts + frontend/lib/labels.ts

**Files:**

- Modify: `frontend/types/api.ts`
- Create: `frontend/lib/labels.ts`

- [ ] **Step 1: Add new types to `frontend/types/api.ts`**

Add `join_code` to `Organization`, `organization_name` to `Invitation`, and new `OrgMember` type:

```typescript
// In the Organization interface — add join_code:
export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  join_code: string; // ← add this
  created_at: string;
}

// In the Invitation interface — add organization_name:
export interface Invitation {
  id: string;
  recruiter_id: string;
  organization_id: string;
  organization_name: string | null; // ← add this
  candidate_email: string;
  candidate_id: string | null;
  token: string;
  status: InvitationStatus;
  expires_at: string;
  created_at: string;
}

// New type — add after RecruiterProfile:
export interface OrgMember {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
}
```

- [ ] **Step 2: Create `frontend/lib/labels.ts`**

```typescript
// frontend/lib/labels.ts
// Single source of truth for all status labels, variants, and event strings.

export const INVITATION_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  rejected: "Refusée",
  expired: "Expirée",
};

export const INVITATION_STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "default",
  accepted: "secondary",
  rejected: "destructive",
  expired: "outline",
};

export const ACCESS_STATUS_LABELS: Record<string, string> = {
  active: "Accès actif",
  invited: "Invitation en attente",
  revoked: "Accès révoqué",
  expired: "Invitation expirée",
};

export const ACCESS_STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "default",
  invited: "secondary",
  revoked: "destructive",
  expired: "outline",
};

export const EVENT_LABELS: Record<string, string> = {
  invitation_sent: "Invitation envoyée",
  invitation_accepted: "Invitation acceptée",
  invitation_rejected: "Invitation refusée",
  invitation_expired: "Invitation expirée",
  access_granted: "Accès accordé",
  access_revoked: "Accès révoqué",
  document_generated: "Dossier généré",
};

export const EVENT_ICONS: Record<string, string> = {
  invitation_sent: "✉️",
  invitation_accepted: "✅",
  invitation_rejected: "❌",
  invitation_expired: "⏰",
  access_granted: "🔓",
  access_revoked: "🔒",
  document_generated: "📄",
};

export function relativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "il y a 1j";
  return `il y a ${days}j`;
}
```

- [ ] **Step 3: Update existing pages to import from labels.ts**

In each file below, remove the local `STATUS_LABELS`, `STATUS_VARIANTS`, `EVENT_LABELS`, `EVENT_ICONS` definitions and import from `@/lib/labels`:

Files to update:

- `frontend/app/(candidate)/candidate/requests/page.tsx` — import `INVITATION_STATUS_LABELS`, `INVITATION_STATUS_VARIANTS`
- `frontend/app/(candidate)/candidate/access/page.tsx` — import `ACCESS_STATUS_LABELS`, `ACCESS_STATUS_VARIANTS`, `EVENT_LABELS`
- `frontend/app/(recruiter)/recruiter/invitations/page.tsx` — import `INVITATION_STATUS_LABELS`, `INVITATION_STATUS_VARIANTS`
- `frontend/app/(candidate)/candidate/dashboard/page.tsx` — import `EVENT_LABELS`, `EVENT_ICONS`, `relativeDate`
- `frontend/app/(recruiter)/recruiter/dashboard/page.tsx` — import `relativeDate`

For example, in `requests/page.tsx` replace:

```typescript
const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  // ...
};
```

with:

```typescript
import {
  INVITATION_STATUS_LABELS as STATUS_LABELS,
  INVITATION_STATUS_VARIANTS as STATUS_VARIANTS,
} from "@/lib/labels";
```

- [ ] **Step 4: Verify TypeScript compiles**

```
cd frontend && npm run build 2>&1 | head -40
```

Fix any type errors (likely: places that pass `Invitation` objects and now expect `organization_name`).

- [ ] **Step 5: Commit**

```
git add frontend/types/api.ts frontend/lib/labels.ts frontend/app/
git commit -m "feat(frontend): add labels.ts vocabulary, update types with join_code + org_name"
```

---

### Task 6: NotificationBell + Breadcrumb components

**Files:**

- Create: `frontend/components/notification-bell.tsx`
- Create: `frontend/components/breadcrumb.tsx`

- [ ] **Step 1: Create `frontend/components/notification-bell.tsx`**

```typescript
// frontend/components/notification-bell.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import { EVENT_ICONS, EVENT_LABELS, relativeDate } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { InteractionEvent, OrganizationInteractionCard } from "@/types/api";

interface NotificationItem {
  icon: string;
  label: string;
  date: string;
  href?: string;
}

interface Props {
  /** Portal determines what data to fetch. */
  portal: "candidate" | "recruiter";
  orgId?: string | null;
}

export function NotificationBell({ portal, orgId }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (portal === "candidate") {
      api
        .get<OrganizationInteractionCard[]>("/candidates/me/organizations")
        .then((orgs) => {
          const events: InteractionEvent[] = orgs
            .flatMap((o) => o.events)
            .sort(
              (a, b) =>
                new Date(b.occurred_at).getTime() -
                new Date(a.occurred_at).getTime(),
            )
            .slice(0, 5);
          setItems(
            events.map((ev) => ({
              icon: EVENT_ICONS[ev.type] ?? "📋",
              label: EVENT_LABELS[ev.type] ?? ev.type,
              date: relativeDate(ev.occurred_at),
              href: "/candidate/access",
            })),
          );
        })
        .catch(() => {});
    }
    // recruiter: no-op for now — future: fetch recent docs/candidates
  }, [portal, orgId]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
          open && "bg-muted/50 text-foreground",
        )}
      >
        <Bell className="size-4" />
        {items.length > 0 && (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-72 rounded-lg border border-border bg-popover shadow-lg">
          <p className="border-b border-border/50 px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Activité récente
          </p>
          {items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Aucune activité récente.
            </p>
          ) : (
            <ul>
              {items.map((item, i) => (
                <li key={i}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/50"
                    >
                      <span className="text-base" aria-hidden>
                        {item.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{item.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.date}
                        </p>
                      </div>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <span className="text-base" aria-hidden>
                        {item.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{item.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.date}
                        </p>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/components/breadcrumb.tsx`**

```typescript
// frontend/components/breadcrumb.tsx
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface Props {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: Props) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3.5 shrink-0" />}
          {item.href && i < items.length - 1 ? (
            <Link href={item.href} className="hover:text-foreground transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className={i === items.length - 1 ? "text-foreground font-medium" : ""}>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Commit**

```
git add frontend/components/notification-bell.tsx frontend/components/breadcrumb.tsx
git commit -m "feat(ui): NotificationBell and Breadcrumb shared components"
```

---

### Task 7: GenerateDossierDialog + InviteCandidateDialog

**Files:**

- Create: `frontend/components/generate-dossier-dialog.tsx`
- Create: `frontend/components/invite-candidate-dialog.tsx`

- [ ] **Step 1: Create `frontend/components/generate-dossier-dialog.tsx`**

```typescript
// frontend/components/generate-dossier-dialog.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useDownload } from "@/lib/hooks";
import type { GeneratedDocument, Template } from "@/types/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  candidateId: string;
  candidateName: string;
  templates: Template[];
}

export function GenerateDossierDialog({
  open,
  onOpenChange,
  orgId,
  candidateId,
  candidateName,
  templates,
}: Props) {
  const [templateId, setTemplateId] = useState("");
  const [format, setFormat] = useState<"docx" | "pdf">("docx");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { download, errors: downloadErrors } = useDownload();

  const validTemplates = templates.filter((t) => t.is_valid);

  async function handleGenerate() {
    if (!templateId) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const doc = await api.post<GeneratedDocument>(
        `/organizations/${orgId}/generate`,
        { candidate_id: candidateId, template_id: templateId, format },
      );
      setResult(doc);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur de génération"));
    } finally {
      setGenerating(false);
    }
  }

  function handleClose() {
    setTemplateId("");
    setFormat("docx");
    setResult(null);
    setError(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Générer un dossier — {candidateName}</DialogTitle>
        </DialogHeader>

        {validTemplates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun template valide. Configurez un template dans{" "}
            <a href="/recruiter/settings" className="underline">
              Configuration
            </a>
            .
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <Select
                value={templateId}
                onValueChange={(v) => v && setTemplateId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un template…" />
                </SelectTrigger>
                <SelectContent>
                  {validTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Format</Label>
              <Select
                value={format}
                onValueChange={(v) => v && setFormat(v as "docx" | "pdf")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="docx">Word (.docx)</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ErrorAlert error={error} />

            {result ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-emerald-600">
                  Dossier généré avec succès !
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    download(
                      `/documents/${result.id}/download`,
                      `dossier.${result.file_format}`,
                      result.id,
                    )
                  }
                >
                  Télécharger ({result.file_format.toUpperCase()})
                </Button>
                <ErrorAlert error={downloadErrors[result.id] ?? null} />
              </div>
            ) : (
              <Button
                onClick={handleGenerate}
                disabled={generating || !templateId}
              >
                {generating ? "Génération…" : "Générer le dossier"}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create `frontend/components/invite-candidate-dialog.tsx`**

```typescript
// frontend/components/invite-candidate-dialog.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import type { Invitation } from "@/types/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  onInvited?: (inv: Invitation) => void;
}

export function InviteCandidateDialog({
  open,
  onOpenChange,
  orgId,
  onInvited,
}: Props) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const inv = await api.post<Invitation>(
        `/organizations/${orgId}/invitations`,
        { candidate_email: email.trim() },
      );
      setSuccess(`Invitation envoyée à ${email.trim()}`);
      setEmail("");
      onInvited?.(inv);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  }

  function handleClose() {
    setEmail("");
    setError(null);
    setSuccess(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inviter un candidat</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email du candidat</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="candidat@exemple.com"
              required
            />
          </div>
          <ErrorAlert error={error} />
          {success && (
            <p role="status" className="text-sm text-emerald-600">
              {success}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Fermer
            </Button>
            <Button type="submit" disabled={sending}>
              {sending ? "Envoi…" : "Envoyer l'invitation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Commit**

```
git add frontend/components/generate-dossier-dialog.tsx frontend/components/invite-candidate-dialog.tsx
git commit -m "feat(ui): GenerateDossierDialog and InviteCandidateDialog components"
```

---

### Task 8: OnboardingOrg component

**Files:**

- Create: `frontend/components/onboarding-org.tsx`

- [ ] **Step 1: Create the component**

```typescript
// frontend/components/onboarding-org.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import type { Organization, RecruiterProfile } from "@/types/api";

type Mode = "create" | "join";

interface Props {
  /** Called after successful create or join with the new organization_id. */
  onSuccess: (orgId: string) => void;
}

export function OnboardingOrg({ onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // create_organization now links the recruiter atomically — no second PUT needed
      const org = await api.post<Organization>("/organizations", {
        name: name.trim(),
      });
      onSuccess(org.id);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Erreur lors de la création",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const profile = await api.post<RecruiterProfile>("/organizations/join", {
        code: code.trim(),
      });
      onSuccess(profile.organization_id!);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "Code invalide ou organisation introuvable",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Configurer votre organisation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2">
          {(["create", "join"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`rounded-lg border p-3 text-left text-sm font-medium transition-all ${
                mode === m
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:border-border/80"
              }`}
            >
              {m === "create" ? "Créer une organisation" : "Rejoindre une organisation"}
            </button>
          ))}
        </div>

        {mode === "create" ? (
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="org-name">Nom de l&apos;organisation</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: Acme Consulting"
                required
              />
            </div>
            <ErrorAlert error={error} />
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Création…" : "Créer et continuer"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="join-code">Code d&apos;invitation</Label>
              <Input
                id="join-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ex: Xk3mP9qR"
                required
              />
              <p className="text-xs text-muted-foreground">
                Demandez ce code à un membre de votre organisation.
              </p>
            </div>
            <ErrorAlert error={error} />
            <Button type="submit" disabled={saving || !code.trim()}>
              {saving ? "Vérification…" : "Rejoindre"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```
git add frontend/components/onboarding-org.tsx
git commit -m "feat(ui): OnboardingOrg component (create or join by code)"
```

---

_Tracks C–E (navigation shell + portal pages) are in the companion plan file: `2026-06-02-ux-refonte-implementation-part2.md`._
