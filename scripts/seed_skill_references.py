#!/usr/bin/env python
# scripts/seed_skill_references.py
"""Idempotent ESCO skill reference seed.

Usage:
    uv run python scripts/seed_skill_references.py
"""

from __future__ import annotations

import asyncio
import csv
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402

from models.skill import SkillKind, SkillReference  # noqa: E402

DATA_FILE = ROOT / "data" / "esco_seed.csv"


def _parse_aliases(raw: str) -> list[str]:
    raw = raw.strip().strip('"')
    if not raw:
        return []
    return [a.strip() for a in raw.split(";") if a.strip()]


async def seed(session: AsyncSession) -> dict[str, int]:
    stats = {"added": 0, "updated": 0, "unchanged": 0}
    with open(DATA_FILE, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            esco_uri = row["esco_uri"].strip() or None
            name = row["name"].strip()
            slug = row["slug"].strip()
            kind_str = row["kind"].strip()
            source = row.get("source", "").strip() or "esco"
            esco_skill_type = row.get("esco_skill_type", "").strip() or None
            aliases = _parse_aliases(row.get("aliases", ""))
            description = row.get("description", "").strip() or None

            try:
                kind = SkillKind(kind_str)
            except ValueError:
                print(f"WARNING: unknown kind '{kind_str}' for '{name}', skipping")
                continue

            if source == "esco" and esco_uri:
                result = await session.execute(
                    select(SkillReference).where(SkillReference.esco_uri == esco_uri)
                )
            else:
                result = await session.execute(
                    select(SkillReference).where(SkillReference.slug == slug)
                )
            existing = result.scalar_one_or_none()

            if existing is None:
                session.add(
                    SkillReference(
                        name=name,
                        slug=slug,
                        kind=kind,
                        aliases=aliases,
                        esco_uri=esco_uri,
                        esco_skill_type=esco_skill_type,
                        source=source,
                        description=description,
                        is_custom=False,
                    )
                )
                stats["added"] += 1
                print(f"  + {name}")
            else:
                changed = False
                for attr, val in [
                    ("name", name),
                    ("aliases", aliases),
                    ("description", description),
                    ("esco_skill_type", esco_skill_type),
                    ("source", source),
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


async def main() -> None:
    db_url = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://jorg:jorg@localhost:5432/jorg",
    )
    engine = create_async_engine(db_url)
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with session_factory() as session:
        stats = await seed(session)
    await engine.dispose()
    print(
        f"\nSeed complete: {stats['added']} added, "
        f"{stats['updated']} updated, {stats['unchanged']} unchanged"
    )


if __name__ == "__main__":
    asyncio.run(main())
