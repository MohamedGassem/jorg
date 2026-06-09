from __future__ import annotations

import re

from sqlalchemy import String, cast, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import LanguageReference
from services.text_utils import normalize_text


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


async def list_all(db: AsyncSession) -> list[LanguageReference]:
    result = await db.execute(select(LanguageReference).order_by(LanguageReference.name))
    return list(result.scalars().all())


LanguageIndex = dict[str, str]  # normalized_label -> display_name


async def build_language_index(db: AsyncSession) -> LanguageIndex:
    """Build normalised-label to display-name lookup from LanguageReference rows.

    Returns empty dict when the table has no rows. cv_parser_service falls
    back to _HUMAN_LANGUAGES in that case.
    """
    refs = await list_all(db)
    index: LanguageIndex = {}
    for ref in refs:
        for label in [ref.name, *ref.aliases]:
            norm = normalize_text(label)
            if norm and norm not in index:
                index[norm] = ref.name
    return index
