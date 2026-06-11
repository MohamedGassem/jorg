# backend/services/skill_reference_service.py
from __future__ import annotations

import re
from uuid import UUID

from sqlalchemy import Text, and_, case, cast, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.skill import SkillKind, SkillReference
from services.references.esco_language_detection import is_esco_language_reference


def slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = slug.replace("++", "pp")  # C++ -> cpp
    slug = slug.replace("#", "-sharp")  # C# -> c-sharp, F# -> f-sharp
    slug = slug.replace("/", "-")  # ASP.NET/MVC -> asp-net-mvc
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


def _is_hidden_esco_language(ref: SkillReference) -> bool:
    return ref.source == "esco" and is_esco_language_reference(
        ref.name,
        ref.description,
        ref.esco_skill_type,
    )


def _match_clauses(query: str):
    """Build the shared ILIKE match filter and priority ordering for a query.
    Returns (match_filter, priority)."""
    aliases_text = cast(SkillReference.aliases, Text)
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    name_exact = SkillReference.name.ilike(escaped, escape="\\")
    alias_exact = aliases_text.ilike(f'%"{escaped}"%', escape="\\")
    name_contains = SkillReference.name.ilike(f"%{escaped}%", escape="\\")
    match_filter = or_(name_contains, alias_exact)
    priority = case(
        (name_exact, 0),
        (alias_exact, 1),
        (name_contains, 2),
        else_=3,
    )
    return match_filter, priority


async def get_or_create_by_name(
    name: str,
    kind: SkillKind,
    creator_candidate_id: UUID,
    db: AsyncSession,
) -> tuple[SkillReference, bool]:
    """Return (ref, was_created). Checks ESCO/jorg first, then candidate's custom, then inserts."""
    slug = slugify(name)
    result = await db.execute(
        select(SkillReference).where(
            SkillReference.slug == slug,
            SkillReference.creator_candidate_id.is_(None),
        )
    )
    ref = result.scalar_one_or_none()
    if ref is not None and not _is_hidden_esco_language(ref):
        return ref, False
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
        source="user_custom",
        aliases=[],
        categories=[],
        is_displayable=False,
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
    for_display: bool = True,
) -> list[SkillReference]:
    if limit <= 0:
        return []

    match_filter, priority = _match_clauses(query)

    if for_display:
        visibility = or_(
            and_(
                SkillReference.source == "jorg",
                SkillReference.is_displayable.is_(True),
            ),
            SkillReference.creator_candidate_id == candidate_id,
        )
    else:
        visibility = or_(
            SkillReference.creator_candidate_id.is_(None),
            SkillReference.creator_candidate_id == candidate_id,
        )

    stmt = (
        select(SkillReference)
        .where(match_filter, visibility)
        .order_by(priority, SkillReference.name, SkillReference.id)
    )

    if kind is not None:
        stmt = stmt.where(SkillReference.kind == kind)

    results: list[SkillReference] = []
    page_size = max(limit * 5, 50)
    offset = 0

    while len(results) < limit:
        result = await db.execute(stmt.limit(page_size).offset(offset))
        page = list(result.scalars().all())
        if not page:
            break
        results.extend(ref for ref in page if not _is_hidden_esco_language(ref))
        offset += page_size

    return results[:limit]


async def search_public(
    query: str,
    kind: SkillKind | None,
    limit: int,
    db: AsyncSession,
) -> list[SkillReference]:
    """Search the PUBLIC jorg catalog (displayable jorg refs only, no candidate-custom).

    Usable by recruiters since it does not require a candidate profile.
    """
    if limit <= 0:
        return []

    match_filter, priority = _match_clauses(query)

    visibility = and_(
        SkillReference.source == "jorg",
        SkillReference.is_displayable.is_(True),
    )

    stmt = (
        select(SkillReference)
        .where(match_filter, visibility)
        .order_by(priority, SkillReference.name, SkillReference.id)
        .limit(limit)
    )

    if kind is not None:
        stmt = stmt.where(SkillReference.kind == kind)

    result = await db.execute(stmt)
    return list(result.scalars().all())
