#!/usr/bin/env python
"""Seed language references and preview/apply ESCO language cleanup.

Usage:
    python scripts/manage_language_references.py
    python scripts/manage_language_references.py --apply-prune
    python scripts/manage_language_references.py --esco-csv data/esco/skills_fr.csv
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core.config import get_settings  # noqa: E402
from models.candidate_profile import LanguageReference  # noqa: E402
from models.skill import (  # noqa: E402
    AchievementSkillTag,
    CandidateSkill,
    ExperienceSkillUsage,
    SkillReference,
)
from services.references.esco_import_service import parse_alt_labels  # noqa: E402
from services.references.esco_language_detection import is_esco_language_reference  # noqa: E402
from services.references.language_reference_service import slugify_language  # noqa: E402

DEFAULT_SEED_CSV = ROOT / "data" / "language_references_seed.csv"


@dataclass
class LanguageRefReport:
    ref: SkillReference
    candidate_skills: int
    experience_usages: int
    achievement_tags: int

    @property
    def reference_count(self) -> int:
        return self.candidate_skills + self.experience_usages + self.achievement_tags


def _parse_aliases(raw: str) -> list[str]:
    raw = raw.strip().strip('"')
    if not raw:
        return []
    return [alias.strip() for alias in raw.split(";") if alias.strip()]


def _dedupe_slug(slug: str, uri: str, used: set[str]) -> str:
    if slug not in used:
        used.add(slug)
        return slug

    suffix = uri.rstrip("/").rsplit("/", 1)[-1][:8]
    candidate = f"{slug}-{suffix}"[:120]
    n = 1
    while candidate in used:
        candidate = f"{slug}-{suffix}-{n}"[:120]
        n += 1
    used.add(candidate)
    return candidate


async def seed_language_references(session: AsyncSession, csv_path: Path) -> dict[str, int]:
    stats = {"added": 0, "updated": 0, "unchanged": 0}

    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = row["name"].strip()
            slug = slugify_language(name)[:120]
            aliases = _parse_aliases(row.get("aliases", ""))
            esco_uri = row.get("esco_uri", "").strip() or None
            description = row.get("description", "").strip() or None
            source = row.get("source", "").strip() or "seed"

            result = await session.execute(
                select(LanguageReference).where(LanguageReference.slug == slug)
            )
            existing = result.scalar_one_or_none()
            if existing is None:
                session.add(
                    LanguageReference(
                        name=name[:100],
                        slug=slug,
                        aliases=aliases,
                        esco_uri=esco_uri,
                        source=source,
                        description=description,
                    )
                )
                stats["added"] += 1
                continue

            changed = False
            updates: list[tuple[str, object | None]] = [
                ("name", name[:100]),
                ("aliases", aliases),
                ("description", description),
            ]
            if esco_uri is not None:
                updates.append(("esco_uri", esco_uri[:500]))
            if existing.source != "esco":
                updates.append(("source", source))

            for attr, value in updates:
                if getattr(existing, attr) != value:
                    setattr(existing, attr, value)
                    changed = True
            stats["updated" if changed else "unchanged"] += 1

    await session.commit()
    return stats


async def import_esco_language_references(
    session: AsyncSession,
    csv_path: Path,
    *,
    limit: int | None,
) -> dict[str, int]:
    stats = {"added": 0, "updated": 0, "skipped": 0}
    used_slugs = set((await session.execute(select(LanguageReference.slug))).scalars().all())
    processed = 0

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if limit is not None and processed >= limit:
                break
            processed += 1

            status = (row.get("status") or "").strip().lower()
            name = (row.get("preferredLabel") or "").strip()
            description = (row.get("description") or "").strip() or None
            esco_uri = (row.get("conceptUri") or "").strip()
            skill_type = (row.get("skillType") or "").strip()
            if (
                (status and status != "released")
                or not name
                or not esco_uri
                or not is_esco_language_reference(name, description, skill_type)
            ):
                stats["skipped"] += 1
                continue

            result = await session.execute(
                select(LanguageReference).where(LanguageReference.esco_uri == esco_uri)
            )
            existing = result.scalar_one_or_none()
            aliases = parse_alt_labels(row.get("altLabels") or "")
            if existing is None:
                result = await session.execute(
                    select(LanguageReference).where(
                        LanguageReference.slug == slugify_language(name)[:120]
                    )
                )
                existing = result.scalar_one_or_none()

            if existing is not None:
                changed = False
                for attr, value in (
                    ("name", name[:100]),
                    ("aliases", aliases),
                    ("esco_uri", esco_uri[:500]),
                    ("description", description),
                    ("source", "esco"),
                ):
                    if getattr(existing, attr) != value:
                        setattr(existing, attr, value)
                        changed = True
                stats["updated" if changed else "skipped"] += 1
                continue

            slug = _dedupe_slug(slugify_language(name)[:120], esco_uri, used_slugs)
            session.add(
                LanguageReference(
                    name=name[:100],
                    slug=slug,
                    aliases=aliases,
                    esco_uri=esco_uri[:500],
                    source="esco",
                    description=description,
                )
            )
            stats["added"] += 1

    await session.commit()
    return stats


async def _count_skill_ref_usage(
    session: AsyncSession,
    model: type[CandidateSkill] | type[ExperienceSkillUsage] | type[AchievementSkillTag],
    skill_ref_id: UUID,
) -> int:
    result = await session.execute(
        select(func.count()).select_from(model).where(model.skill_ref_id == skill_ref_id)
    )
    return int(result.scalar_one())


async def collect_language_skill_refs(session: AsyncSession) -> list[LanguageRefReport]:
    result = await session.execute(
        select(SkillReference).where(
            SkillReference.source == "esco",
            SkillReference.esco_skill_type == "knowledge",
        )
    )

    reports: list[LanguageRefReport] = []
    for ref in result.scalars().all():
        if not is_esco_language_reference(ref.name, ref.description, ref.esco_skill_type):
            continue
        reports.append(
            LanguageRefReport(
                ref=ref,
                candidate_skills=await _count_skill_ref_usage(session, CandidateSkill, ref.id),
                experience_usages=await _count_skill_ref_usage(
                    session, ExperienceSkillUsage, ref.id
                ),
                achievement_tags=await _count_skill_ref_usage(session, AchievementSkillTag, ref.id),
            )
        )
    return reports


async def prune_language_skill_refs(
    session: AsyncSession, *, apply: bool
) -> list[LanguageRefReport]:
    reports = await collect_language_skill_refs(session)
    if apply:
        for report in reports:
            if report.reference_count == 0:
                await session.delete(report.ref)
        await session.commit()
    return reports


def _print_prune_report(reports: list[LanguageRefReport], *, preview_limit: int) -> None:
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
            print(f"  - {report.ref.name} ({report.ref.id}) refs={report.reference_count}")


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed dedicated language references and clean ESCO language skills."
    )
    parser.add_argument("--seed-csv", type=Path, default=DEFAULT_SEED_CSV)
    parser.add_argument("--skip-seed", action="store_true")
    parser.add_argument("--esco-csv", type=Path, default=None)
    parser.add_argument("--esco-limit", type=int, default=None)
    parser.add_argument("--skip-prune", action="store_true")
    parser.add_argument("--apply-prune", action="store_true")
    parser.add_argument("--preview-limit", type=int, default=20)
    args = parser.parse_args()

    if not args.skip_seed and not args.seed_csv.exists():
        print(f"ERROR: seed CSV not found: {args.seed_csv}", file=sys.stderr)
        raise SystemExit(1)
    if args.esco_csv is not None and not args.esco_csv.exists():
        print(f"ERROR: ESCO CSV not found: {args.esco_csv}", file=sys.stderr)
        raise SystemExit(1)

    db_url = os.environ.get("DATABASE_URL") or get_settings().database_url
    engine = create_async_engine(db_url)
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)

    async with session_factory() as session:
        if not args.skip_seed:
            seed_stats = await seed_language_references(session, args.seed_csv)
            print(
                "Language reference seed complete: "
                f"{seed_stats['added']} added, "
                f"{seed_stats['updated']} updated, "
                f"{seed_stats['unchanged']} unchanged."
            )

        if args.esco_csv is not None:
            esco_stats = await import_esco_language_references(
                session, args.esco_csv, limit=args.esco_limit
            )
            print(
                "ESCO language import complete: "
                f"{esco_stats['added']} added, "
                f"{esco_stats['updated']} updated, "
                f"{esco_stats['skipped']} skipped."
            )

        if not args.skip_prune:
            reports = await prune_language_skill_refs(session, apply=args.apply_prune)
            _print_prune_report(reports, preview_limit=args.preview_limit)
            if args.apply_prune:
                deleted = sum(1 for report in reports if report.reference_count == 0)
                print(f"\nDeleted {deleted} unreferenced language skill refs.")
            else:
                print("\nDry-run only. Re-run with --apply-prune to delete safe rows.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
