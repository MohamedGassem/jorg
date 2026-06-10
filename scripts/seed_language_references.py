#!/usr/bin/env python
"""Idempotent seed for language_references.

Usage:
    uv run python scripts/seed_language_references.py
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
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from core.config import get_settings  # noqa: E402
from models.candidate_profile import LanguageReference  # noqa: E402
from services.language_reference_service import slugify_language  # noqa: E402

DATA_FILE = ROOT / "data" / "language_references_seed.csv"


def _parse_aliases(raw: str) -> list[str]:
    raw = raw.strip().strip('"')
    if not raw:
        return []
    return [alias.strip() for alias in raw.split(";") if alias.strip()]


async def seed(session: AsyncSession) -> dict[str, int]:
    stats = {"added": 0, "updated": 0, "unchanged": 0}
    with open(DATA_FILE, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row["name"].strip()
            slug = slugify_language(name)
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
                        name=name,
                        slug=slug,
                        aliases=aliases,
                        esco_uri=esco_uri,
                        source=source,
                        description=description,
                    )
                )
                stats["added"] += 1
                print(f"  + {name}")
                continue

            changed = False
            updates: list[tuple[str, object | None]] = [
                ("name", name),
                ("aliases", aliases),
                ("description", description),
            ]
            if esco_uri is not None:
                updates.append(("esco_uri", esco_uri))
            if existing.source != "esco":
                updates.append(("source", source))

            for attr, value in updates:
                if getattr(existing, attr) != value:
                    setattr(existing, attr, value)
                    changed = True
            if changed:
                stats["updated"] += 1
                print(f"  ~ {name}")
            else:
                stats["unchanged"] += 1

    await session.commit()
    return stats


async def main() -> None:
    db_url = os.environ.get("DATABASE_URL") or get_settings().database_url
    engine = create_async_engine(db_url)
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with session_factory() as session:
        stats = await seed(session)
    await engine.dispose()
    print(
        f"\nLanguage reference seed complete: {stats['added']} added, "
        f"{stats['updated']} updated, {stats['unchanged']} unchanged"
    )


if __name__ == "__main__":
    asyncio.run(main())
