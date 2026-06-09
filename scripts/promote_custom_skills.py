#!/usr/bin/env python
"""Graduation des skills user_custom vers le catalogue Jorg.

Usage:
    uv run python scripts/promote_custom_skills.py             # dry-run (defaut)
    uv run python scripts/promote_custom_skills.py --apply     # applique la promotion
    uv run python scripts/promote_custom_skills.py --threshold 5  # seuil personnalise
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import func, select, update  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402

from models.skill import CandidateSkill, ExperienceSkillUsage, SkillReference  # noqa: E402


async def find_candidates(session: AsyncSession, threshold: int) -> list[dict]:
    """Return user_custom skills appearing in >= threshold distinct candidates."""
    stmt = (
        select(
            SkillReference.slug,
            SkillReference.name,
            func.count(SkillReference.creator_candidate_id.distinct()).label(
                "occurrences"
            ),
        )
        .where(SkillReference.source == "user_custom")
        .group_by(SkillReference.slug, SkillReference.name)
        .having(func.count(SkillReference.creator_candidate_id.distinct()) >= threshold)
        .order_by(func.count(SkillReference.creator_candidate_id.distinct()).desc())
    )
    result = await session.execute(stmt)
    return [
        {"slug": row.slug, "name": row.name, "occurrences": row.occurrences}
        for row in result
    ]


async def promote(session: AsyncSession, slug: str, name: str) -> None:
    """Promote all user_custom rows for a slug to a global jorg ref."""
    result = await session.execute(
        select(SkillReference).where(
            SkillReference.slug == slug,
            SkillReference.creator_candidate_id.is_(None),
        )
    )
    global_ref = result.scalar_one_or_none()

    if global_ref is None:
        result = await session.execute(
            select(SkillReference)
            .where(
                SkillReference.slug == slug,
                SkillReference.source == "user_custom",
            )
            .limit(1)
        )
        sample = result.scalar_one()
        global_ref = SkillReference(
            name=name,
            slug=slug,
            kind=sample.kind,
            aliases=list(set(sample.aliases)),
            categories=[],
            source="jorg",
            is_custom=False,
            is_displayable=True,
        )
        session.add(global_ref)
        await session.flush()

    result = await session.execute(
        select(SkillReference).where(
            SkillReference.slug == slug,
            SkillReference.source == "user_custom",
        )
    )
    custom_refs = list(result.scalars().all())
    custom_ids = [r.id for r in custom_refs]

    if custom_ids:
        await session.execute(
            update(CandidateSkill)
            .where(CandidateSkill.skill_ref_id.in_(custom_ids))
            .values(skill_ref_id=global_ref.id)
        )
        await session.execute(
            update(ExperienceSkillUsage)
            .where(ExperienceSkillUsage.skill_ref_id.in_(custom_ids))
            .values(skill_ref_id=global_ref.id)
        )
        for ref in custom_refs:
            await session.delete(ref)


async def main(apply: bool, threshold: int) -> None:
    db_url = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://jorg:jorg@localhost:5432/jorg",
    )
    engine = create_async_engine(db_url)
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)

    async with session_factory() as session:
        candidates = await find_candidates(session, threshold)

        if not candidates:
            print(
                f"No user_custom skills found with >= {threshold} distinct candidates."
            )
            return

        print(f"\nSkills reaching promotion threshold ({threshold} candidates):\n")
        for c in candidates:
            print(f"  {c['occurrences']:3d}x  {c['name']}  ({c['slug']})")

        if not apply:
            print(
                f"\nDry-run mode. Run with --apply to promote {len(candidates)} skills."
            )
            return

        print(f"\nPromoting {len(candidates)} skills...")
        for c in candidates:
            await promote(session, c["slug"], c["name"])
            print(f"  promoted: {c['name']}")

        await session.commit()
        print("\nDone.")

    await engine.dispose()


if __name__ == "__main__":
    apply = "--apply" in sys.argv
    threshold = 3
    for i, arg in enumerate(sys.argv):
        if arg == "--threshold" and i + 1 < len(sys.argv):
            threshold = int(sys.argv[i + 1])
    asyncio.run(main(apply=apply, threshold=threshold))
