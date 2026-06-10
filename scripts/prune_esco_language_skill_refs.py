#!/usr/bin/env python
"""Remove ESCO natural-language rows from skill_references.

The command is dry-run by default. Use ``--apply`` to delete unreferenced rows.
Referenced rows are reported but never deleted automatically.

Usage:
    uv run python scripts/prune_esco_language_skill_refs.py
    uv run python scripts/prune_esco_language_skill_refs.py --apply
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from core.config import get_settings  # noqa: E402
from models.skill import (  # noqa: E402
    AchievementSkillTag,
    CandidateSkill,
    ExperienceSkillUsage,
    SkillReference,
)
from services.esco_language_detection import is_esco_language_reference  # noqa: E402


@dataclass
class LanguageRefReport:
    ref: SkillReference
    candidate_skills: int
    experience_usages: int
    achievement_tags: int

    @property
    def reference_count(self) -> int:
        return self.candidate_skills + self.experience_usages + self.achievement_tags


async def _count_skill_ref_usage(
    session: AsyncSession,
    model: type[CandidateSkill]
    | type[ExperienceSkillUsage]
    | type[AchievementSkillTag],
    skill_ref_id: UUID,
) -> int:
    result = await session.execute(
        select(func.count())
        .select_from(model)
        .where(model.skill_ref_id == skill_ref_id)
    )
    return int(result.scalar_one())


async def collect_language_refs(session: AsyncSession) -> list[LanguageRefReport]:
    result = await session.execute(
        select(SkillReference).where(
            SkillReference.source == "esco",
            SkillReference.esco_skill_type == "knowledge",
        )
    )
    reports: list[LanguageRefReport] = []
    for ref in result.scalars().all():
        if not is_esco_language_reference(
            ref.name, ref.description, ref.esco_skill_type
        ):
            continue
        reports.append(
            LanguageRefReport(
                ref=ref,
                candidate_skills=await _count_skill_ref_usage(
                    session, CandidateSkill, ref.id
                ),
                experience_usages=await _count_skill_ref_usage(
                    session, ExperienceSkillUsage, ref.id
                ),
                achievement_tags=await _count_skill_ref_usage(
                    session, AchievementSkillTag, ref.id
                ),
            )
        )
    return reports


async def prune(session: AsyncSession, *, apply: bool) -> list[LanguageRefReport]:
    reports = await collect_language_refs(session)
    if apply:
        for report in reports:
            if report.reference_count == 0:
                await session.delete(report.ref)
        await session.commit()
    return reports


def _print_preview(reports: list[LanguageRefReport], *, preview_limit: int) -> None:
    unreferenced = [report for report in reports if report.reference_count == 0]
    referenced = [report for report in reports if report.reference_count > 0]

    print(f"Detected ESCO natural-language skill refs: {len(reports)}")
    print(f"Unreferenced and safe to delete: {len(unreferenced)}")
    print(f"Referenced and left untouched: {len(referenced)}")

    for title, items in (
        ("Unreferenced examples", unreferenced),
        ("Referenced examples", referenced),
    ):
        if not items:
            continue
        print(f"\n{title}:")
        for report in items[:preview_limit]:
            print(
                f"  - {report.ref.name} ({report.ref.id}) refs={report.reference_count}"
            )


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prune ESCO natural-language references from skill_references."
    )
    parser.add_argument(
        "--apply", action="store_true", help="Delete unreferenced rows."
    )
    parser.add_argument(
        "--preview-limit",
        type=int,
        default=20,
        help="Number of examples to print per section.",
    )
    args = parser.parse_args()

    db_url = os.environ.get("DATABASE_URL") or get_settings().database_url
    engine = create_async_engine(db_url)
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with session_factory() as session:
        reports = await prune(session, apply=args.apply)
    await engine.dispose()

    _print_preview(reports, preview_limit=args.preview_limit)
    if args.apply:
        deleted = sum(1 for report in reports if report.reference_count == 0)
        print(f"\nDeleted {deleted} unreferenced language refs.")
    else:
        print("\nDry-run only. Re-run with --apply to delete unreferenced rows.")


if __name__ == "__main__":
    asyncio.run(main())
