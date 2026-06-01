# backend/services/skill_reference_service.py
from __future__ import annotations

import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.skill import SkillKind, SkillReference


def slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = slug.replace("++", "pp")  # C++ → cpp
    slug = slug.replace("#", "-sharp")  # C# → c-sharp, F# → f-sharp
    slug = slug.replace("/", "-")  # ASP.NET/MVC → asp-net-mvc
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


async def get_or_create_by_name(
    name: str,
    kind: SkillKind,
    creator_candidate_id: UUID,
    db: AsyncSession,
) -> tuple[SkillReference, bool]:
    """Return (ref, was_created). Checks ESCO first, then candidate's custom, then inserts."""
    slug = slugify(name)
    # Check ESCO skills first (creator_candidate_id IS NULL)
    result = await db.execute(
        select(SkillReference).where(
            SkillReference.slug == slug,
            SkillReference.creator_candidate_id.is_(None),
        )
    )
    ref = result.scalar_one_or_none()
    if ref is not None:
        return ref, False
    # Then check candidate's own custom skills
    result = await db.execute(
        select(SkillReference).where(
            SkillReference.slug == slug,
            SkillReference.creator_candidate_id == creator_candidate_id,
        )
    )
    ref = result.scalar_one_or_none()
    if ref is not None:
        return ref, False
    ref = SkillReference(
        name=name,
        slug=slug,
        kind=kind,
        is_custom=True,
        source="manual",
        aliases=[],
        creator_candidate_id=creator_candidate_id,
    )
    db.add(ref)
    await db.commit()
    await db.refresh(ref)
    return ref, True


async def search(
    query: str,
    kind: SkillKind | None,
    limit: int,
    candidate_id: UUID,
    db: AsyncSession,
) -> list[SkillReference]:
    stmt = select(SkillReference).where(
        SkillReference.name.ilike(f"%{query}%"),
        (SkillReference.creator_candidate_id.is_(None))
        | (SkillReference.creator_candidate_id == candidate_id),
    )
    if kind is not None:
        stmt = stmt.where(SkillReference.kind == kind)
    result = await db.execute(stmt.limit(limit))
    return list(result.scalars().all())
