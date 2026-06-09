#!/usr/bin/env python
"""Seed du catalogue Jorg depuis un fichier JSON.

Usage:
    uv run python scripts/seed_jorg_skills.py data/jorg_skills_seed.json
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402

from core.config import get_settings  # noqa: E402
from models.skill import SkillKind, SkillReference  # noqa: E402
from services.references.skill_reference_service import slugify  # noqa: E402

VALID_CATEGORIES = {
    "Data Science",
    "Machine Learning",
    "Generative AI",
    "Software Engineering",
    "Data Engineering",
    "Cloud / DevOps",
    "Project Management",
    "Product",
    "Communication / Marketing",
    "Business Analysis",
    "Cybersecurity",
    "Finance / Contrôle de gestion",
    "RH / Recrutement",
    "Industrie / Qualité",
}


def validate_entry(entry: dict, index: int) -> None:
    required = {"canonical_label", "aliases", "categories", "kind"}
    missing = required - entry.keys()
    if missing:
        raise ValueError(f"Entry {index}: missing fields {missing}")
    unknown_cats = set(entry["categories"]) - VALID_CATEGORIES
    if unknown_cats:
        raise ValueError(
            f"Entry {index} ({entry['canonical_label']!r}): unknown categories {unknown_cats}. "
            f"Valid: {sorted(VALID_CATEGORIES)}"
        )
    try:
        SkillKind(entry["kind"])
    except ValueError:
        raise ValueError(
            f"Entry {index} ({entry['canonical_label']!r}): invalid kind {entry['kind']!r}. "
            f"Valid: {[e.value for e in SkillKind]}"
        )


async def seed(session: AsyncSession, entries: list[dict]) -> dict[str, int]:
    stats = {"added": 0, "updated": 0, "unchanged": 0}
    for i, entry in enumerate(entries):
        validate_entry(entry, i)
        name = entry["canonical_label"].strip()
        slug = slugify(name)
        kind = SkillKind(entry["kind"])
        aliases = [a.strip() for a in entry["aliases"] if a.strip()]
        categories = entry["categories"]

        result = await session.execute(
            select(SkillReference).where(
                SkillReference.slug == slug,
                SkillReference.creator_candidate_id.is_(None),
            )
        )
        existing = result.scalar_one_or_none()

        if existing is None:
            session.add(
                SkillReference(
                    name=name,
                    slug=slug,
                    kind=kind,
                    aliases=aliases,
                    categories=categories,
                    source="jorg",
                    is_custom=False,
                    is_displayable=True,
                )
            )
            stats["added"] += 1
            print(f"  + {name}")
        else:
            changed = False
            for attr, val in [
                ("name", name),
                ("aliases", aliases),
                ("categories", categories),
                ("kind", kind),
                ("is_displayable", True),
                ("source", "jorg"),
            ]:
                if getattr(existing, attr) != val:
                    setattr(existing, attr, val)
                    changed = True
            if changed:
                stats["updated"] += 1
                print(f"  ~ {name}")
            else:
                stats["unchanged"] += 1

    await session.commit()
    return stats


async def main(json_path: Path) -> None:
    entries = json.loads(json_path.read_text(encoding="utf-8-sig"))
    print(f"Validating {len(entries)} entries...")
    for i, entry in enumerate(entries):
        validate_entry(entry, i)
    print("Validation OK.")

    db_url = os.environ.get("DATABASE_URL") or get_settings().database_url
    engine = create_async_engine(db_url)
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with session_factory() as session:
        stats = await seed(session, entries)
    await engine.dispose()
    print(
        f"\nSeed complete: {stats['added']} added, "
        f"{stats['updated']} updated, {stats['unchanged']} unchanged"
    )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: uv run python scripts/seed_jorg_skills.py <path/to/skills.json>")
        sys.exit(1)
    asyncio.run(main(Path(sys.argv[1])))
