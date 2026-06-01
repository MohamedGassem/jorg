# Achievement Skill Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow candidates to tag skills from their experience "bouquet" onto individual achievements, and let recruiters click a skill to see which achievements used it.

**Architecture:** New `achievement_skill_tags` join table (many-to-many between achievements and skill_refs). Skills live at the experience level (`ExperienceSkillUsage`), achievements claim them via `AchievementSkillTag`. Frontend refactors `ExperienceSection` to show bouquet + per-achievement chips with Option A inline editing. Recruiter list page gains skill-highlight expand with summary banner.

**Tech Stack:** Python/FastAPI/SQLAlchemy (async), Alembic, Pydantic v2, Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui

---

## File Map

| Action | Path                                                                  |
| ------ | --------------------------------------------------------------------- |
| Create | `backend/alembic/versions/e8f9a0b1c2d3_add_achievement_skill_tags.py` |
| Modify | `backend/models/skill.py`                                             |
| Modify | `backend/schemas/skill.py`                                            |
| Modify | `backend/api/routes/skills.py`                                        |
| Create | `backend/tests/integration/test_achievement_skill_tags_api.py`        |
| Modify | `backend/schemas/recruiter.py`                                        |
| Modify | `backend/services/recruiter_service.py`                               |
| Modify | `frontend/types/api.ts`                                               |
| Modify | `frontend/app/(candidate)/candidate/skills/page.tsx`                  |
| Modify | `frontend/app/(recruiter)/recruiter/candidates/page.tsx`              |

---

## Task 1: Alembic migration

**Files:**

- Create: `backend/alembic/versions/e8f9a0b1c2d3_add_achievement_skill_tags.py`

- [ ] **Step 1: Create the migration file**

```python
# backend/alembic/versions/e8f9a0b1c2d3_add_achievement_skill_tags.py
"""add achievement skill tags

Revision ID: e8f9a0b1c2d3
Revises: 91867dfba791
Create Date: 2026-06-01

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e8f9a0b1c2d3"
down_revision: str | Sequence[str] | None = "91867dfba791"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "achievement_skill_tags",
        sa.Column("achievement_id", sa.Uuid(), nullable=False),
        sa.Column("skill_ref_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["achievement_id"], ["achievements.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["skill_ref_id"], ["skill_references.id"], ondelete="RESTRICT"
        ),
        sa.UniqueConstraint("achievement_id", "skill_ref_id", name="uq_achievement_skill_tag"),
        sa.PrimaryKeyConstraint("achievement_id", "skill_ref_id"),
    )
    op.create_index(
        "ix_achievement_skill_tags_achievement_id",
        "achievement_skill_tags",
        ["achievement_id"],
        unique=False,
    )
    op.drop_column("experience_skill_usages", "achievement_id")


def downgrade() -> None:
    op.add_column(
        "experience_skill_usages",
        sa.Column("achievement_id", sa.Uuid(), nullable=True),
    )
    op.drop_index("ix_achievement_skill_tags_achievement_id", table_name="achievement_skill_tags")
    op.drop_table("achievement_skill_tags")
```

- [ ] **Step 2: Verify the migration resolves correctly**

```bash
cd backend && alembic upgrade e8f9a0b1c2d3 --sql | head -40
```

Expected: SQL output showing `CREATE TABLE achievement_skill_tags` and `ALTER TABLE experience_skill_usages DROP COLUMN achievement_id`. No errors.

- [ ] **Step 3: Commit**

```bash
git add backend/alembic/versions/e8f9a0b1c2d3_add_achievement_skill_tags.py
git commit -m "feat(db): add achievement_skill_tags table, drop achievement_id from skill_usages"
```

---

## Task 2: SQLAlchemy model

**Files:**

- Modify: `backend/models/skill.py`

- [ ] **Step 1: Add `AchievementSkillTag` model and update `Achievement` and `ExperienceSkillUsage`**

Replace the entire `backend/models/skill.py` with:

```python
# backend/models/skill.py
from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from models.candidate_profile import Experience


class SkillKind(StrEnum):
    technical = "technical"
    functional = "functional"
    sectoral = "sectoral"
    methodology = "methodology"
    tool = "tool"
    soft = "soft"


class UsageRole(StrEnum):
    lead = "lead"
    implementer = "implementer"
    contributor = "contributor"
    user = "user"
    exposed_to = "exposed_to"


class UsageIntensity(StrEnum):
    primary = "primary"
    secondary = "secondary"
    incidental = "incidental"


class SkillReference(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "skill_references"

    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    kind: Mapped[SkillKind] = mapped_column(
        Enum(SkillKind, name="skill_kind", values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
    )
    parent_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("skill_references.id", ondelete="SET NULL"),
        nullable=True,
    )
    aliases: Mapped[list[str]] = mapped_column(__import__("sqlalchemy").JSON, default=list, nullable=False)
    esco_uri: Mapped[str | None] = mapped_column(String(500), nullable=True)
    esco_skill_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="esco", nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    creator_candidate_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    __table_args__ = (
        Index(
            "uq_skill_references_slug_esco",
            "slug",
            unique=True,
            postgresql_where=text("creator_candidate_id IS NULL"),
        ),
        Index(
            "uq_skill_references_slug_custom",
            "slug",
            "creator_candidate_id",
            unique=True,
            postgresql_where=text("creator_candidate_id IS NOT NULL"),
        ),
        CheckConstraint(
            "is_custom = (creator_candidate_id IS NOT NULL)",
            name="ck_skill_ref_custom_consistency",
        ),
    )


class CandidateSkill(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "candidate_skills"

    candidate_id: Mapped[UUID] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    skill_ref_id: Mapped[UUID] = mapped_column(
        ForeignKey("skill_references.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    self_assessed_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    skill_ref: Mapped[SkillReference] = relationship("SkillReference")

    __table_args__ = (UniqueConstraint("candidate_id", "skill_ref_id", name="uq_candidate_skill"),)


class AchievementSkillTag(Base):
    __tablename__ = "achievement_skill_tags"

    achievement_id: Mapped[UUID] = mapped_column(
        ForeignKey("achievements.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
    )
    skill_ref_id: Mapped[UUID] = mapped_column(
        ForeignKey("skill_references.id", ondelete="RESTRICT"),
        nullable=False,
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    skill_ref: Mapped[SkillReference] = relationship("SkillReference")

    __table_args__ = (
        UniqueConstraint("achievement_id", "skill_ref_id", name="uq_achievement_skill_tag"),
    )


class Achievement(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "achievements"

    experience_id: Mapped[UUID] = mapped_column(
        ForeignKey("experiences.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    impact: Mapped[str | None] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    experience: Mapped[Experience] = relationship("Experience", back_populates="achievements")
    skill_tags: Mapped[list[AchievementSkillTag]] = relationship(
        "AchievementSkillTag",
        cascade="all, delete-orphan",
        primaryjoin="Achievement.id == AchievementSkillTag.achievement_id",
    )


class ExperienceSkillUsage(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "experience_skill_usages"

    experience_id: Mapped[UUID] = mapped_column(
        ForeignKey("experiences.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    skill_ref_id: Mapped[UUID] = mapped_column(
        ForeignKey("skill_references.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    usage_role: Mapped[UsageRole] = mapped_column(
        Enum(UsageRole, name="usage_role", values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
    )
    intensity: Mapped[UsageIntensity] = mapped_column(
        Enum(
            UsageIntensity,
            name="usage_intensity",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        default=UsageIntensity.secondary,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    skill_ref: Mapped[SkillReference] = relationship("SkillReference")
    experience: Mapped[Experience] = relationship("Experience", back_populates="skill_usages")

    __table_args__ = (
        UniqueConstraint("experience_id", "skill_ref_id", name="uq_experience_skill_usage"),
    )
```

- [ ] **Step 2: Update the `JSON` import at the top of the file**

The model above uses `__import__("sqlalchemy").JSON` as a workaround — instead, add `JSON` to the existing import block at line 9. The full import should be:

```python
from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
```

Then replace `__import__("sqlalchemy").JSON` with `JSON` in the `SkillReference.aliases` mapped_column.

- [ ] **Step 3: Commit**

```bash
git add backend/models/skill.py
git commit -m "feat(models): add AchievementSkillTag model, remove achievement_id from ExperienceSkillUsage"
```

---

## Task 3: Pydantic schemas

**Files:**

- Modify: `backend/schemas/skill.py`

- [ ] **Step 1: Update `schemas/skill.py`**

Replace the full file:

```python
# backend/schemas/skill.py
from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from models.skill import SkillKind, UsageIntensity, UsageRole


class SkillReferenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    kind: SkillKind
    aliases: list[str]
    esco_uri: str | None
    esco_skill_type: str | None
    source: str
    description: str | None
    is_custom: bool
    creator_candidate_id: UUID | None
    created_at: datetime
    updated_at: datetime


class SkillReferenceCreate(BaseModel):
    name: str
    kind: SkillKind
    aliases: list[str] = []
    esco_uri: str | None = None


# ---- CandidateSkill ----------------------------------------------------------


class CandidateSkillCreate(BaseModel):
    skill_ref_id: UUID
    self_assessed_level: str | None = None
    featured: bool = False
    notes: str | None = None


class CandidateSkillUpdate(BaseModel):
    self_assessed_level: str | None = None
    featured: bool | None = None
    notes: str | None = None
    kind: SkillKind | None = None


class CandidateSkillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    candidate_id: UUID
    skill_ref_id: UUID
    skill_ref: SkillReferenceRead
    self_assessed_level: str | None
    featured: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime


# ---- ExperienceSkillUsage ----------------------------------------------------


class ExperienceSkillUsageCreate(BaseModel):
    skill_ref_id: UUID
    usage_role: UsageRole
    intensity: UsageIntensity = UsageIntensity.secondary


class ExperienceSkillUsageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    experience_id: UUID
    skill_ref_id: UUID
    skill_ref: SkillReferenceRead
    usage_role: UsageRole
    intensity: UsageIntensity
    created_at: datetime


# ---- AchievementSkillTag -----------------------------------------------------


class AchievementSkillTagCreate(BaseModel):
    skill_ref_id: UUID


class AchievementSkillTagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    skill_ref_id: UUID
    skill_ref: SkillReferenceRead
    created_at: datetime


# ---- Achievement -------------------------------------------------------------


class AchievementCreate(BaseModel):
    description: str
    impact: str | None = None
    order: int = 0


class AchievementUpdate(BaseModel):
    description: str | None = None
    impact: str | None = None
    order: int | None = None


class AchievementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    experience_id: UUID
    description: str
    impact: str | None
    order: int
    skill_tags: list[AchievementSkillTagRead] = []
    created_at: datetime
    updated_at: datetime


# ---- Metrics -----------------------------------------------------------------


class SkillMetricsRead(BaseModel):
    skill_ref_id: UUID
    skill_name: str
    skill_kind: SkillKind
    months_weighted: float
    last_used: date | None
    distinct_contexts: int
    validated: bool
```

- [ ] **Step 2: Update `_EXP_OPTIONS` in `candidates.py` to load `skill_tags` on achievements**

Open `backend/api/routes/candidates.py`. The `_EXP_OPTIONS` list at line 46 loads achievements and skill_usages. Add a nested selectinload for `skill_tags`:

```python
from models.skill import AchievementSkillTag, ExperienceSkillUsage

_EXP_OPTIONS = [
    selectinload(Experience.achievements).selectinload(Achievement.skill_tags).selectinload(AchievementSkillTag.skill_ref),
    selectinload(Experience.skill_usages).selectinload(ExperienceSkillUsage.skill_ref),
]
```

Also add `Achievement` and `AchievementSkillTag` to the imports from `models.skill`:

```python
from models.skill import Achievement, AchievementSkillTag, ExperienceSkillUsage
```

- [ ] **Step 3: Commit**

```bash
git add backend/schemas/skill.py backend/api/routes/candidates.py
git commit -m "feat(schemas): add AchievementSkillTagRead, update AchievementRead with skill_tags, remove achievement_id from ExperienceSkillUsageRead/Create"
```

---

## Task 4: POST skill-tag endpoint (TDD)

**Files:**

- Create: `backend/tests/integration/test_achievement_skill_tags_api.py`
- Modify: `backend/api/routes/skills.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/integration/test_achievement_skill_tags_api.py
from httpx import AsyncClient


async def _create_experience(client: AsyncClient, headers: dict) -> str:
    r = await client.post(
        "/candidates/me/experiences",
        headers=headers,
        json={"client_name": "TagCorp", "role": "Dev", "start_date": "2022-01-01"},
    )
    assert r.status_code == 201
    return str(r.json()["id"])


async def _create_skill_ref(client: AsyncClient, headers: dict, name: str) -> str:
    r = await client.post(
        "/skill-references", headers=headers, json={"name": name, "kind": "technical"}
    )
    assert r.status_code == 201
    return str(r.json()["id"])


async def _add_skill_usage(
    client: AsyncClient, headers: dict, exp_id: str, ref_id: str
) -> None:
    r = await client.post(
        f"/candidates/me/experiences/{exp_id}/skill-usages",
        headers=headers,
        json={"skill_ref_id": ref_id, "usage_role": "implementer", "intensity": "primary"},
    )
    assert r.status_code == 201


async def _create_achievement(
    client: AsyncClient, headers: dict, exp_id: str, description: str
) -> str:
    r = await client.post(
        f"/candidates/me/experiences/{exp_id}/achievements",
        headers=headers,
        json={"description": description},
    )
    assert r.status_code == 201
    return str(r.json()["id"])


async def test_add_skill_tag_to_achievement(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ref_id = await _create_skill_ref(client, candidate_headers, "Python")
    await _add_skill_usage(client, candidate_headers, exp_id, ref_id)
    ach_id = await _create_achievement(client, candidate_headers, exp_id, "Deployed service")

    r = await client.post(
        f"/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["skill_ref"]["name"] == "Python"
    assert data["skill_ref_id"] == ref_id
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && python -m pytest tests/integration/test_achievement_skill_tags_api.py::test_add_skill_tag_to_achievement -v
```

Expected: FAIL with `404` or `422` (route not found).

- [ ] **Step 3: Implement the POST endpoint**

Add to `backend/api/routes/skills.py`, after the achievements section at the end of the file:

```python
# ---- AchievementSkillTag -----------------------------------------------------


@router.post(
    "/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags",
    response_model=AchievementSkillTagRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_skill_tag(
    exp_id: UUID,
    ach_id: UUID,
    data: AchievementSkillTagCreate,
    profile: CandidateProfile_dep,
    db: DB,
) -> AchievementSkillTag:
    await _get_experience_or_404(exp_id, profile.id, db)
    # Verify achievement belongs to this experience
    ach_result = await db.execute(
        select(AchievementModel).where(
            AchievementModel.id == ach_id,
            AchievementModel.experience_id == exp_id,
        )
    )
    if ach_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="achievement not found")
    # Verify skill is in the experience bouquet
    usage_result = await db.execute(
        select(ExperienceSkillUsage).where(
            ExperienceSkillUsage.experience_id == exp_id,
            ExperienceSkillUsage.skill_ref_id == data.skill_ref_id,
        )
    )
    if usage_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="skill_ref_id is not in this experience's skill bouquet",
        )
    tag = AchievementSkillTagModel(
        achievement_id=ach_id,
        skill_ref_id=data.skill_ref_id,
    )
    try:
        db.add(tag)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="skill already tagged on this achievement",
        ) from None
    result = await db.execute(
        select(AchievementSkillTagModel)
        .where(
            AchievementSkillTagModel.achievement_id == ach_id,
            AchievementSkillTagModel.skill_ref_id == data.skill_ref_id,
        )
        .options(selectinload(AchievementSkillTagModel.skill_ref))
    )
    return result.scalar_one()
```

Also add the imports to the top of `skills.py`:

```python
from models.skill import (
    Achievement as AchievementModel,
    AchievementSkillTag as AchievementSkillTagModel,
    CandidateSkill,
    ExperienceSkillUsage,
    SkillKind,
    SkillReference,
)
from schemas.skill import (
    AchievementCreate,
    AchievementRead,
    AchievementSkillTagCreate,
    AchievementSkillTagRead,
    AchievementUpdate,
    CandidateSkillCreate,
    CandidateSkillRead,
    CandidateSkillUpdate,
    ExperienceSkillUsageCreate,
    ExperienceSkillUsageRead,
    SkillMetricsRead,
    SkillReferenceCreate,
    SkillReferenceRead,
)
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd backend && python -m pytest tests/integration/test_achievement_skill_tags_api.py::test_add_skill_tag_to_achievement -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/api/routes/skills.py backend/tests/integration/test_achievement_skill_tags_api.py
git commit -m "feat(api): add POST skill-tag endpoint for achievements"
```

---

## Task 5: DELETE skill-tag endpoint + test

**Files:**

- Modify: `backend/tests/integration/test_achievement_skill_tags_api.py`
- Modify: `backend/api/routes/skills.py`

- [ ] **Step 1: Add the failing test**

Append to `test_achievement_skill_tags_api.py`:

```python
async def test_delete_skill_tag(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ref_id = await _create_skill_ref(client, candidate_headers, "Docker")
    await _add_skill_usage(client, candidate_headers, exp_id, ref_id)
    ach_id = await _create_achievement(client, candidate_headers, exp_id, "Built container")

    await client.post(
        f"/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id},
    )
    r = await client.delete(
        f"/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags/{ref_id}",
        headers=candidate_headers,
    )
    assert r.status_code == 204

    # Verify tag is gone via GET experiences
    exps = await client.get("/candidates/me/experiences", headers=candidate_headers)
    target = next(e for e in exps.json() if e["id"] == exp_id)
    ach = next(a for a in target["achievements"] if a["id"] == ach_id)
    assert ach["skill_tags"] == []
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && python -m pytest tests/integration/test_achievement_skill_tags_api.py::test_delete_skill_tag -v
```

Expected: FAIL (route not found).

- [ ] **Step 3: Implement the DELETE endpoint**

Append to the `AchievementSkillTag` section in `backend/api/routes/skills.py`:

```python
@router.delete(
    "/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags/{skill_ref_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_skill_tag(
    exp_id: UUID,
    ach_id: UUID,
    skill_ref_id: UUID,
    profile: CandidateProfile_dep,
    db: DB,
) -> None:
    await _get_experience_or_404(exp_id, profile.id, db)
    result = await db.execute(
        select(AchievementSkillTagModel).where(
            AchievementSkillTagModel.achievement_id == ach_id,
            AchievementSkillTagModel.skill_ref_id == skill_ref_id,
        )
    )
    tag = result.scalar_one_or_none()
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="skill tag not found")
    await db.delete(tag)
    await db.commit()
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd backend && python -m pytest tests/integration/test_achievement_skill_tags_api.py::test_delete_skill_tag -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/api/routes/skills.py backend/tests/integration/test_achievement_skill_tags_api.py
git commit -m "feat(api): add DELETE skill-tag endpoint for achievements"
```

---

## Task 6: Error cases tests

**Files:**

- Modify: `backend/tests/integration/test_achievement_skill_tags_api.py`

- [ ] **Step 1: Add all error-case tests**

Append to `test_achievement_skill_tags_api.py`:

```python
async def test_add_skill_tag_duplicate_returns_409(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ref_id = await _create_skill_ref(client, candidate_headers, "Kafka")
    await _add_skill_usage(client, candidate_headers, exp_id, ref_id)
    ach_id = await _create_achievement(client, candidate_headers, exp_id, "Built pipeline")

    payload = {"skill_ref_id": ref_id}
    r1 = await client.post(
        f"/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags",
        headers=candidate_headers,
        json=payload,
    )
    assert r1.status_code == 201

    r2 = await client.post(
        f"/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags",
        headers=candidate_headers,
        json=payload,
    )
    assert r2.status_code == 409


async def test_add_skill_tag_skill_not_in_bouquet_returns_422(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ref_id = await _create_skill_ref(client, candidate_headers, "NotInBouquet")
    # deliberately do NOT add skill_usage for this experience
    ach_id = await _create_achievement(client, candidate_headers, exp_id, "Some work")

    r = await client.post(
        f"/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id},
    )
    assert r.status_code == 422
    assert "bouquet" in r.json()["detail"]


async def test_add_skill_tag_wrong_achievement_returns_404(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ref_id = await _create_skill_ref(client, candidate_headers, "Redis")
    await _add_skill_usage(client, candidate_headers, exp_id, ref_id)

    r = await client.post(
        f"/candidates/me/experiences/{exp_id}/achievements/00000000-0000-0000-0000-000000000000/skill-tags",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id},
    )
    assert r.status_code == 404


async def test_delete_nonexistent_skill_tag_returns_404(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ref_id = await _create_skill_ref(client, candidate_headers, "Phantom")
    await _add_skill_usage(client, candidate_headers, exp_id, ref_id)
    ach_id = await _create_achievement(client, candidate_headers, exp_id, "Nothing tagged")

    r = await client.delete(
        f"/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags/{ref_id}",
        headers=candidate_headers,
    )
    assert r.status_code == 404
```

- [ ] **Step 2: Run all tests — expect PASS**

```bash
cd backend && python -m pytest tests/integration/test_achievement_skill_tags_api.py -v
```

Expected: All 6 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/integration/test_achievement_skill_tags_api.py
git commit -m "test(api): add error-case tests for skill-tag endpoints"
```

---

## Task 7: Verify GET experiences returns skill_tags in achievements

**Files:**

- Modify: `backend/tests/integration/test_achievement_skill_tags_api.py`

- [ ] **Step 1: Add the integration test**

Append to `test_achievement_skill_tags_api.py`:

```python
async def test_get_experiences_returns_skill_tags_on_achievements(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_id = await _create_experience(client, candidate_headers)
    ref_id = await _create_skill_ref(client, candidate_headers, "Terraform")
    await _add_skill_usage(client, candidate_headers, exp_id, ref_id)
    ach_id = await _create_achievement(client, candidate_headers, exp_id, "Infra as code")

    await client.post(
        f"/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id},
    )

    r = await client.get("/candidates/me/experiences", headers=candidate_headers)
    assert r.status_code == 200
    exps = r.json()
    target = next(e for e in exps if e["id"] == exp_id)
    assert len(target["achievements"]) == 1
    ach = target["achievements"][0]
    assert len(ach["skill_tags"]) == 1
    assert ach["skill_tags"][0]["skill_ref"]["name"] == "Terraform"
    assert ach["skill_tags"][0]["skill_ref_id"] == ref_id
```

- [ ] **Step 2: Run test — expect PASS**

```bash
cd backend && python -m pytest tests/integration/test_achievement_skill_tags_api.py::test_get_experiences_returns_skill_tags_on_achievements -v
```

Expected: PASS (the `_EXP_OPTIONS` selectinload added in Task 3 covers this).

- [ ] **Step 3: Run the full backend test suite**

```bash
cd backend && python -m pytest tests/integration/ -v --tb=short 2>&1 | tail -30
```

Expected: All tests PASS. If `test_experience_skill_usage_api.py` tests fail because they pass `achievement_id` in the create payload, remove that field from the payloads in that test file.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/integration/test_achievement_skill_tags_api.py
git commit -m "test(api): verify GET experiences returns nested skill_tags on achievements"
```

---

## Task 8: Recruiter service — expose experiences with skill_tags

**Files:**

- Modify: `backend/schemas/recruiter.py`
- Modify: `backend/services/recruiter_service.py`
- Modify: `backend/api/routes/organizations.py` (selectinload)

- [ ] **Step 1: Add `experiences` to `AccessibleCandidateRead` in `schemas/recruiter.py`**

Add the import at the top of `schemas/recruiter.py`:

```python
from schemas.skill import ExperienceRead  # add this import
```

Then update `AccessibleCandidateRead` (around line 57):

```python
class AccessibleCandidateRead(BaseModel):
    """Candidate exposed to a recruiter via an active AccessGrant."""

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

Wait — `ExperienceRead` is in `schemas/candidate.py`, not `schemas/skill.py`. Import from the correct location:

```python
from schemas.candidate import ExperienceRead
```

- [ ] **Step 2: Update `list_accessible_candidates` in `recruiter_service.py` to load experiences**

Add imports at the top of `recruiter_service.py`:

```python
from models.candidate_profile import Experience
from models.skill import Achievement, AchievementSkillTag, ExperienceSkillUsage
from sqlalchemy.orm import selectinload
```

Replace the `list_accessible_candidates` function:

```python
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
    """Return candidates with an active AccessGrant on this org, with optional filters."""
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

    # Add profile_id to the select so we can load experiences
    stmt = builder.build().add_columns(CandidateProfile.id.label("profile_id"))
    result = await db.execute(stmt)
    rows = result.all()

    # Load experiences with achievements + skill_tags for all profiles in one query
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
                selectinload(Experience.skill_usages)
                .selectinload(ExperienceSkillUsage.skill_ref),
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

- [ ] **Step 3: Run the recruiter-related integration tests**

```bash
cd backend && python -m pytest tests/integration/test_recruiter_api.py -v --tb=short 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/schemas/recruiter.py backend/services/recruiter_service.py
git commit -m "feat(api): expose experiences with skill_tags in accessible candidates endpoint"
```

---

## Task 9: Frontend types

**Files:**

- Modify: `frontend/types/api.ts`

- [ ] **Step 1: Update `api.ts`**

Replace the `Experience` interface and add new types. Find and replace these sections:

**Add after the `LanguageLevel` line (line 14):**

```typescript
export type UsageRole =
  | "lead"
  | "implementer"
  | "contributor"
  | "user"
  | "exposed_to";
export type UsageIntensity = "primary" | "secondary" | "incidental";
```

**Replace the `Experience` interface (lines 17–31):**

```typescript
export interface AchievementSkillTag {
  skill_ref_id: string;
  skill_ref: SkillReference;
  created_at: string;
}

export interface Achievement {
  id: string;
  experience_id: string;
  description: string;
  impact: string | null;
  order: number;
  skill_tags: AchievementSkillTag[];
  created_at: string;
  updated_at: string;
}

export interface ExperienceSkillUsage {
  id: string;
  experience_id: string;
  skill_ref_id: string;
  skill_ref: SkillReference;
  usage_role: UsageRole;
  intensity: UsageIntensity;
  created_at: string;
}

export interface Experience {
  id: string;
  profile_id: string;
  client_name: string;
  role: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  context: string | null;
  achievements_summary: string | null;
  achievements: Achievement[];
  skill_usages: ExperienceSkillUsage[];
  created_at: string;
  updated_at: string;
}
```

**In `AccessibleCandidateRead` (around line 224), add `experiences`:**

```typescript
export interface AccessibleCandidateRead {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  daily_rate: number | null;
  contract_type: ContractType | null;
  availability_status: AvailabilityStatus | null;
  work_mode: WorkMode | null;
  location_preference: string | null;
  preferred_domains: string[] | null;
  experiences: Experience[];
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

Expected: Errors only in `skills/page.tsx` (ExperienceSection uses stale fields) — that's expected and fixed in the next task. No errors in `types/api.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add frontend/types/api.ts
git commit -m "feat(types): update Experience, add Achievement/ExperienceSkillUsage/AchievementSkillTag types"
```

---

## Task 10: ExperienceSection — candidate UI refactor

**Files:**

- Modify: `frontend/app/(candidate)/candidate/skills/page.tsx`

This task replaces the `ExperienceSection` component and related types entirely. The rest of the file (languages, education, skills sections) is untouched.

- [ ] **Step 1: Update the imports in the file**

Find the import block at the top of `skills/page.tsx`. Add these to the type imports:

```typescript
import type {
  Achievement,
  AchievementSkillTag,
  Experience,
  ExperienceSkillUsage,
  Skill,
  SkillReference,
  SkillKind,
  Education,
  Certification,
  Language,
  LanguageLevel,
} from "@/types/api";
```

- [ ] **Step 2: Replace the `ExpForm` type, `EMPTY_EXP`, `expToForm`, and `ExperienceSection` component**

Find the block starting at `// ---- Experiences` (around line 142) and replace everything through the end of the `ExperienceSection` function with the following. The component after `ExperienceSection` (e.g., `EducationSection`) must be preserved.

```typescript
// ---- Experiences ------------------------------------------------------------

type ExpForm = {
  client_name: string;
  role: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  description: string;
  context: string;
};

const EMPTY_EXP: ExpForm = {
  client_name: "",
  role: "",
  start_date: "",
  end_date: "",
  is_current: false,
  description: "",
  context: "",
};

function expToForm(exp: Experience): ExpForm {
  return {
    client_name: exp.client_name,
    role: exp.role,
    start_date: exp.start_date,
    end_date: exp.end_date ?? "",
    is_current: exp.is_current,
    description: exp.description ?? "",
    context: exp.context ?? "",
  };
}

type AchForm = {
  description: string;
  impact: string;
};

// AchievementRow — single bullet with inline edit form (Option A)
function AchievementRow({
  ach,
  skillUsages,
  expId,
  onSaved,
  onDeleted,
}: {
  ach: Achievement;
  skillUsages: ExperienceSkillUsage[];
  expId: string;
  onSaved: (updated: Achievement) => void;
  onDeleted: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AchForm>({
    description: ach.description,
    impact: ach.impact ?? "",
  });
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    new Set(ach.skill_tags.map((t) => t.skill_ref_id)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openForm() {
    setForm({ description: ach.description, impact: ach.impact ?? "" });
    setCheckedIds(new Set(ach.skill_tags.map((t) => t.skill_ref_id)));
    setOpen(true);
  }

  function toggleChip(refId: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(refId) ? next.delete(refId) : next.add(refId);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // 1. PATCH achievement text
      const updated = await api.put<Achievement>(
        `/candidates/me/experiences/${expId}/achievements/${ach.id}`,
        { description: form.description || null, impact: form.impact || null },
      );
      // 2. Sync skill tags: delete all, then add checked
      const existingIds = new Set(ach.skill_tags.map((t) => t.skill_ref_id));
      const toDelete = [...existingIds].filter((id) => !checkedIds.has(id));
      const toAdd = [...checkedIds].filter((id) => !existingIds.has(id));
      await Promise.all([
        ...toDelete.map((id) =>
          api.delete(
            `/candidates/me/experiences/${expId}/achievements/${ach.id}/skill-tags/${id}`,
          ),
        ),
        ...toAdd.map((id) =>
          api.post(
            `/candidates/me/experiences/${expId}/achievements/${ach.id}/skill-tags`,
            { skill_ref_id: id },
          ),
        ),
      ]);
      // Reconstruct achievement with new skill_tags from checked
      const newTags = skillUsages
        .filter((u) => checkedIds.has(u.skill_ref_id))
        .map((u) => ({
          skill_ref_id: u.skill_ref_id,
          skill_ref: u.skill_ref,
          created_at: new Date().toISOString(),
        }));
      onSaved({ ...updated, skill_tags: newTags });
      setOpen(false);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur lors de la sauvegarde"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await api.delete(
        `/candidates/me/experiences/${expId}/achievements/${ach.id}`,
      );
      onDeleted(ach.id);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur lors de la suppression"));
    }
  }

  return (
    <div>
      <div
        className={`group flex items-start gap-2 rounded-md px-2 py-1.5 ${open ? "bg-muted/20" : "hover:bg-muted/10"}`}
      >
        <span className="mt-0.5 shrink-0 text-muted-foreground">•</span>
        <div className="min-w-0 flex-1">
          <span className="text-sm">{ach.description}</span>
          {ach.impact && (
            <p className="mt-0.5 text-xs text-muted-foreground italic">
              {ach.impact}
            </p>
          )}
          {ach.skill_tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {ach.skill_tags.map((t) => (
                <span
                  key={t.skill_ref_id}
                  className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                >
                  {t.skill_ref.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={openForm}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Éditer"
          >
            <Pencil className="size-3" />
          </button>
        </div>
      </div>

      {open && (
        <div className="mx-6 mb-2 mt-1 space-y-3 rounded-lg border border-border/60 bg-muted/10 p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`ach-desc-${ach.id}`} className="text-xs">
              Réalisation
            </Label>
            <textarea
              id={`ach-desc-${ach.id}`}
              rows={2}
              value={form.description}
              onChange={(e) =>
                setForm((p) => ({ ...p, description: e.target.value }))
              }
              className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`ach-impact-${ach.id}`} className="text-xs">
              Impact{" "}
              <span className="text-muted-foreground font-normal">
                (optionnel)
              </span>
            </Label>
            <Input
              id={`ach-impact-${ach.id}`}
              value={form.impact}
              onChange={(e) =>
                setForm((p) => ({ ...p, impact: e.target.value }))
              }
              placeholder="ex: −40% temps de déploiement"
            />
          </div>
          {skillUsages.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Skills associés à cette réalisation
              </p>
              <div className="flex flex-wrap gap-1.5">
                {skillUsages.map((u) => {
                  const checked = checkedIds.has(u.skill_ref_id);
                  return (
                    <button
                      key={u.skill_ref_id}
                      type="button"
                      onClick={() => toggleChip(u.skill_ref_id)}
                      className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${
                        checked
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-border/80"
                      }`}
                    >
                      {u.skill_ref.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              className="mr-auto text-xs text-destructive hover:underline"
            >
              Supprimer
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-7 text-xs"
            >
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !form.description.trim()}
              className="h-7 text-xs"
            >
              {saving ? "…" : "Sauvegarder"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// AddAchievementRow — inline form for new achievements
function AddAchievementRow({
  expId,
  skillUsages,
  onAdded,
}: {
  expId: string;
  skillUsages: ExperienceSkillUsage[];
  onAdded: (ach: Achievement) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AchForm>({ description: "", impact: "" });
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleChip(refId: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(refId) ? next.delete(refId) : next.add(refId);
      return next;
    });
  }

  async function handleAdd() {
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<Achievement>(
        `/candidates/me/experiences/${expId}/achievements`,
        { description: form.description, impact: form.impact || null },
      );
      // Add skill tags
      await Promise.all(
        [...checkedIds].map((id) =>
          api.post(
            `/candidates/me/experiences/${expId}/achievements/${created.id}/skill-tags`,
            { skill_ref_id: id },
          ),
        ),
      );
      const newTags = skillUsages
        .filter((u) => checkedIds.has(u.skill_ref_id))
        .map((u) => ({
          skill_ref_id: u.skill_ref_id,
          skill_ref: u.skill_ref,
          created_at: new Date().toISOString(),
        }));
      onAdded({ ...created, skill_tags: newTags });
      setForm({ description: "", impact: "" });
      setCheckedIds(new Set());
      setOpen(false);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur lors de la création"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full rounded-md border border-dashed border-border/60 py-1.5 text-xs text-muted-foreground hover:border-border hover:text-foreground"
      >
        + Ajouter une réalisation
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-border/60 bg-muted/10 p-3">
      <div className="space-y-1.5">
        <Label htmlFor={`new-ach-desc-${expId}`} className="text-xs">
          Réalisation <span className="text-destructive">*</span>
        </Label>
        <textarea
          id={`new-ach-desc-${expId}`}
          rows={2}
          autoFocus
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="Décrivez la réalisation…"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`new-ach-impact-${expId}`} className="text-xs">
          Impact{" "}
          <span className="text-muted-foreground font-normal">(optionnel)</span>
        </Label>
        <Input
          id={`new-ach-impact-${expId}`}
          value={form.impact}
          onChange={(e) => setForm((p) => ({ ...p, impact: e.target.value }))}
          placeholder="ex: −40% temps de déploiement"
        />
      </div>
      {skillUsages.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Skills associés à cette réalisation
          </p>
          <div className="flex flex-wrap gap-1.5">
            {skillUsages.map((u) => {
              const checked = checkedIds.has(u.skill_ref_id);
              return (
                <button
                  key={u.skill_ref_id}
                  type="button"
                  onClick={() => toggleChip(u.skill_ref_id)}
                  className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${
                    checked
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-border/80"
                  }`}
                >
                  {u.skill_ref.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setOpen(false); setForm({ description: "", impact: "" }); setCheckedIds(new Set()); }}
          className="h-7 text-xs"
        >
          Annuler
        </Button>
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={saving || !form.description.trim()}
          className="h-7 text-xs"
        >
          {saving ? "…" : "Ajouter"}
        </Button>
      </div>
    </div>
  );
}

// ExperienceCard — one card per experience
function ExperienceCard({
  exp,
  onUpdated,
  onDeleted,
}: {
  exp: Experience;
  onUpdated: (updated: Experience) => void;
  onDeleted: (id: string) => void;
}) {
  const [editingExp, setEditingExp] = useState(false);
  const [form, setForm] = useState<ExpForm>(expToForm(exp));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>(exp.achievements);

  function set<K extends keyof ExpForm>(k: K, v: ExpForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSaveExp(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await api.put<Experience>(
        `/candidates/me/experiences/${exp.id}`,
        {
          client_name: form.client_name,
          role: form.role,
          start_date: form.start_date,
          end_date: form.is_current ? null : form.end_date || null,
          is_current: form.is_current,
          description: form.description || null,
          context: form.context || null,
        },
      );
      onUpdated({ ...updated, achievements, skill_usages: exp.skill_usages });
      setEditingExp(false);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur lors de la sauvegarde"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteExp() {
    try {
      await api.delete(`/candidates/me/experiences/${exp.id}`);
      onDeleted(exp.id);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur lors de la suppression"));
    }
  }

  function handleAchSaved(updated: Achievement) {
    setAchievements((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  function handleAchDeleted(id: string) {
    setAchievements((prev) => prev.filter((a) => a.id !== id));
  }

  function handleAchAdded(ach: Achievement) {
    setAchievements((prev) => [...prev, ach]);
  }

  const dates = exp.is_current
    ? `${exp.start_date} → présent`
    : `${exp.start_date}${exp.end_date ? ` → ${exp.end_date}` : ""}`;

  return (
    <div className="rounded-xl border border-border/60 bg-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-border/40 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">
            {exp.client_name} — {exp.role}
          </p>
          <p className="text-xs text-muted-foreground">{dates}</p>
          {exp.description && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {exp.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => { setEditingExp(!editingExp); setForm(expToForm(exp)); }}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Éditer l'expérience"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDeleteExp}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
            title="Supprimer"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Edit experience form */}
      {editingExp && (
        <form onSubmit={handleSaveExp} className="space-y-3 border-b border-border/40 bg-muted/10 px-4 py-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor={`exp-client-${exp.id}`} className="text-xs">Client *</Label>
              <Input id={`exp-client-${exp.id}`} value={form.client_name} onChange={(e) => set("client_name", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`exp-role-${exp.id}`} className="text-xs">Rôle *</Label>
              <Input id={`exp-role-${exp.id}`} value={form.role} onChange={(e) => set("role", e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor={`exp-start-${exp.id}`} className="text-xs">Date début *</Label>
              <Input id={`exp-start-${exp.id}`} type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`exp-end-${exp.id}`} className="text-xs">Date fin</Label>
              <Input id={`exp-end-${exp.id}`} type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} disabled={form.is_current} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input id={`exp-current-${exp.id}`} type="checkbox" checked={form.is_current} onChange={(e) => { set("is_current", e.target.checked); if (e.target.checked) set("end_date", ""); }} className="h-4 w-4 cursor-pointer accent-primary" />
            <Label htmlFor={`exp-current-${exp.id}`} className="cursor-pointer font-normal text-xs">Poste actuel</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`exp-desc-${exp.id}`} className="text-xs">Description</Label>
            <Textarea id={`exp-desc-${exp.id}`} value={form.description} onChange={(v) => set("description", v)} rows={2} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setEditingExp(false)} className="h-7 text-xs">Annuler</Button>
            <Button size="sm" type="submit" disabled={saving} className="h-7 text-xs">{saving ? "…" : "Sauvegarder"}</Button>
          </div>
        </form>
      )}

      {/* Skill bouquet */}
      {exp.skill_usages.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/40 px-4 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
            Skills
          </span>
          {exp.skill_usages.map((u) => (
            <span
              key={u.id}
              className="rounded-full border border-border/60 bg-muted/30 px-2.5 py-0.5 text-xs text-muted-foreground"
            >
              {u.skill_ref.name}
            </span>
          ))}
        </div>
      )}

      {/* Achievements */}
      <div className="px-4 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Réalisations
        </p>
        {achievements.map((ach) => (
          <AchievementRow
            key={ach.id}
            ach={ach}
            skillUsages={exp.skill_usages}
            expId={exp.id}
            onSaved={handleAchSaved}
            onDeleted={handleAchDeleted}
          />
        ))}
        <AddAchievementRow
          expId={exp.id}
          skillUsages={exp.skill_usages}
          onAdded={handleAchAdded}
        />
      </div>
    </div>
  );
}

function ExperienceSection() {
  const [items, setItems] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<ExpForm>(EMPTY_EXP);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Experience[]>("/candidates/me/experiences")
      .then(setItems)
      .catch((err) =>
        setFetchError(extractErrorMessage(err, "Impossible de charger les expériences")),
      )
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof ExpForm>(k: K, v: ExpForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<Experience>("/candidates/me/experiences", {
        client_name: form.client_name,
        role: form.role,
        start_date: form.start_date,
        end_date: form.is_current ? null : form.end_date || null,
        is_current: form.is_current,
        description: form.description || null,
        context: form.context || null,
      });
      setItems((prev) => [...prev, created]);
      setForm(EMPTY_EXP);
      setAdding(false);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur lors de la création"));
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return <div className="h-24 animate-pulse rounded-xl bg-muted" />;
  if (fetchError)
    return <p className="text-sm text-destructive">{fetchError}</p>;

  return (
    <div className="space-y-3">
      {items.map((exp) => (
        <ExperienceCard
          key={exp.id}
          exp={exp}
          onUpdated={(updated) =>
            setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
          }
          onDeleted={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
        />
      ))}

      {adding ? (
        <form
          onSubmit={handleAdd}
          className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-exp-client">Client *</Label>
              <Input id="new-exp-client" value={form.client_name} onChange={(e) => set("client_name", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-exp-role">Rôle *</Label>
              <Input id="new-exp-role" value={form.role} onChange={(e) => set("role", e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-exp-start">Date début *</Label>
              <Input id="new-exp-start" type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-exp-end">Date fin</Label>
              <Input id="new-exp-end" type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} disabled={form.is_current} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input id="new-exp-current" type="checkbox" checked={form.is_current} onChange={(e) => { set("is_current", e.target.checked); if (e.target.checked) set("end_date", ""); }} className="h-4 w-4 cursor-pointer accent-primary" />
            <Label htmlFor="new-exp-current" className="cursor-pointer font-normal">Poste actuel</Label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-exp-desc">Description</Label>
            <Textarea id="new-exp-desc" value={form.description} onChange={(v) => set("description", v)} rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => { setAdding(false); setForm(EMPTY_EXP); }}>Annuler</Button>
            <Button size="sm" type="submit" disabled={saving}>{saving ? "…" : "Créer"}</Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)} className="gap-1.5">
          <Plus className="size-3.5" />
          Ajouter une expérience
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Check TypeScript compiles without errors in this file**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "skills/page"
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/(candidate)/candidate/skills/page.tsx"
git commit -m "feat(ui): refactor ExperienceSection with bouquet display and achievement skill tagging"
```

---

## Task 11: Recruiter candidates page — skill highlight (Option A+)

**Files:**

- Modify: `frontend/app/(recruiter)/recruiter/candidates/page.tsx`

- [ ] **Step 1: Add state for the active skill filter**

In `CandidatesPage`, add state at the top of the component (after existing state declarations):

```typescript
const [activeSkillFilter, setActiveSkillFilter] = useState<{
  candidateId: string;
  skillRefId: string;
  skillName: string;
} | null>(null);
```

- [ ] **Step 2: Add the `CandidateSkillHighlight` sub-component**

Add this component above `CandidatesPage`:

```typescript
import type { AccessibleCandidateRead, Experience, Achievement } from "@/types/api";

function CandidateSkillHighlight({
  candidate,
  activeSkillRefId,
  activeSkillName,
  onClose,
}: {
  candidate: AccessibleCandidateRead;
  activeSkillRefId: string;
  activeSkillName: string;
  onClose: () => void;
}) {
  const [focusOnly, setFocusOnly] = useState(true);

  const matchingExps = candidate.experiences.filter((exp) =>
    exp.achievements.some((ach) =>
      ach.skill_tags.some((t) => t.skill_ref_id === activeSkillRefId),
    ),
  );

  const totalCount = candidate.experiences
    .flatMap((e) => e.achievements)
    .filter((a) => a.skill_tags.some((t) => t.skill_ref_id === activeSkillRefId))
    .length;

  return (
    <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5">
      {/* Summary banner */}
      <div className="flex items-center justify-between border-b border-primary/20 px-3 py-2">
        <p className="text-xs font-medium text-primary">
          {activeSkillName} ·{" "}
          <span className="font-normal text-muted-foreground">
            {totalCount} réalisation{totalCount > 1 ? "s" : ""} dans{" "}
            {matchingExps.length} expérience{matchingExps.length > 1 ? "s" : ""}
          </span>
        </p>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={focusOnly}
              onChange={(e) => setFocusOnly(e.target.checked)}
              className="accent-primary"
            />
            Liées uniquement
          </label>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Experiences */}
      <div className="space-y-2 p-3">
        {candidate.experiences.map((exp) => {
          const relevantAchs = exp.achievements.filter((a) =>
            a.skill_tags.some((t) => t.skill_ref_id === activeSkillRefId),
          );
          if (focusOnly && relevantAchs.length === 0) return null;

          return (
            <div key={exp.id} className="rounded-md bg-background/60 px-3 py-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold">
                  {exp.client_name} — {exp.role}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {exp.start_date}
                  {exp.end_date ? ` → ${exp.end_date}` : exp.is_current ? " → présent" : ""}
                </span>
              </div>
              <div className="space-y-0.5">
                {exp.achievements.map((ach) => {
                  const isMatch = ach.skill_tags.some(
                    (t) => t.skill_ref_id === activeSkillRefId,
                  );
                  if (focusOnly && !isMatch) return null;
                  return (
                    <div
                      key={ach.id}
                      className={`flex items-start gap-1.5 rounded px-1.5 py-1 ${
                        isMatch ? "bg-primary/10" : "opacity-40"
                      }`}
                    >
                      <span
                        className={`mt-0.5 text-xs ${isMatch ? "text-primary" : "text-muted-foreground"}`}
                      >
                        •
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs ${isMatch ? "font-medium text-foreground" : "text-muted-foreground"}`}
                        >
                          {ach.description}
                        </p>
                        {ach.impact && isMatch && (
                          <p className="text-[10px] text-muted-foreground italic">
                            {ach.impact}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update the candidate card rendering to show skill pills and the highlight component**

Find the `{candidates.map((c) => (` block (around line 266) and replace the card content with:

```typescript
{candidates.map((c) => {
  const isActive = activeSkillFilter?.candidateId === c.user_id;
  // Collect unique skills from experiences
  const expSkills = Array.from(
    new Map(
      c.experiences
        .flatMap((e) => e.skill_usages)
        .map((u) => [u.skill_ref_id, u.skill_ref]),
    ).entries(),
  ).map(([id, ref]) => ({ id, name: ref.name }));

  return (
    <li key={c.user_id}>
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-base">
            {c.first_name && c.last_name
              ? `${c.first_name} ${c.last_name}`
              : c.email}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          {c.title && <p>{c.title}</p>}
          <div className="flex flex-wrap gap-3">
            {c.daily_rate && <span>TJM : {c.daily_rate} €/j</span>}
            {/* ... keep any other existing fields here ... */}
          </div>

          {/* Skill pills — clickable for highlight */}
          {expSkills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {expSkills.map((sk) => {
                const active =
                  isActive && activeSkillFilter?.skillRefId === sk.id;
                return (
                  <button
                    key={sk.id}
                    type="button"
                    onClick={() => {
                      if (active) {
                        setActiveSkillFilter(null);
                      } else {
                        setActiveSkillFilter({
                          candidateId: c.user_id,
                          skillRefId: sk.id,
                          skillName: sk.name,
                        });
                      }
                    }}
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    {sk.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Skill highlight expand */}
          {isActive && activeSkillFilter && (
            <CandidateSkillHighlight
              candidate={c}
              activeSkillRefId={activeSkillFilter.skillRefId}
              activeSkillName={activeSkillFilter.skillName}
              onClose={() => setActiveSkillFilter(null)}
            />
          )}

          {/* Add-to-opportunity UI — keep from original file unchanged */}
          {opportunities.length > 0 && (
            <div className="pt-1">
              {pickingFor === c.user_id ? (
                <div className="flex flex-wrap gap-2">
                  {opportunities.map((opp) => (
                    <Button
                      key={opp.id}
                      size="sm"
                      variant="outline"
                      disabled={addingTo === opp.id}
                      onClick={() => handleAddToOpportunity(c.user_id, opp.id)}
                    >
                      {opp.title}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => setPickingFor(null)}>
                    Annuler
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setPickingFor(c.user_id)}>
                  Ajouter à une opportunité
                </Button>
              )}
              {addFeedback[c.user_id] && (
                <p className="mt-1 text-xs text-muted-foreground">{addFeedback[c.user_id]}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
})}
```

Make sure to keep the existing "add to opportunity" button that was previously in the card — find it in the original file and re-include it inside the new card content.

- [ ] **Step 4: Add missing imports**

Ensure `useState` is imported (it already is) and add `X` to the lucide-react imports if not present:

```typescript
import { X } from "lucide-react";
```

- [ ] **Step 5: Check TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "candidates/page"
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add "frontend/app/(recruiter)/recruiter/candidates/page.tsx"
git commit -m "feat(ui): add skill highlight with achievement list on recruiter candidate cards"
```

---

## Task 12: Final integration check

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && python -m pytest tests/integration/ -v --tb=short 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 2: Run frontend type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Run the app and manually verify**

Start the backend:

```bash
cd backend && uvicorn main:app --reload
```

Start the frontend:

```bash
cd frontend && npm run dev
```

Manual checks:

1. Log in as candidate → Skills page → Expériences section shows with bouquet + achievements
2. Add a skill to an experience, add an achievement, click ✏, check skill chip → save → chip appears on achievement row
3. Log in as recruiter → Candidates page → skill pills visible on candidate card → click a skill → banner shows count + achievements highlight with focus toggle

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: achievement skill tags — full feature complete (backend + frontend)" || echo "nothing to commit"
```
