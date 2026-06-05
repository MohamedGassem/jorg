from __future__ import annotations

import re

from sqlalchemy import String, cast, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import LanguageReference


def slugify_language(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


async def search(
    query: str,
    limit: int,
    db: AsyncSession,
) -> list[LanguageReference]:
    if limit <= 0:
        return []

    normalized_query = query.strip()
    if len(normalized_query) < 1:
        return []

    like = f"%{normalized_query}%"
    stmt = (
        select(LanguageReference)
        .where(
            or_(
                LanguageReference.name.ilike(like),
                cast(LanguageReference.aliases, String).ilike(like),
            )
        )
        .order_by(LanguageReference.name, LanguageReference.id)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())
