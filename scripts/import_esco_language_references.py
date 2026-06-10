#!/usr/bin/env python
"""Import ESCO natural languages into language_references.

Usage:
    uv run python scripts/import_esco_language_references.py
    uv run python scripts/import_esco_language_references.py --csv data/esco/skills_fr.csv
"""

from __future__ import annotations

import argparse
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
from services.esco_import_service import parse_alt_labels  # noqa: E402
from services.esco_language_detection import is_esco_language_reference  # noqa: E402
from services.language_reference_service import slugify_language  # noqa: E402

DEFAULT_CSV = ROOT / "data" / "esco" / "skills_fr.csv"


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


async def import_esco_languages(
    session: AsyncSession,
    csv_path: Path,
    *,
    limit: int | None = None,
) -> dict[str, int]:
    stats = {"added": 0, "updated": 0, "skipped": 0}
    existing_uris = set(
        (await session.execute(select(LanguageReference.esco_uri))).scalars().all()
    )
    existing_uris.discard(None)
    used_slugs = set(
        (await session.execute(select(LanguageReference.slug))).scalars().all()
    )

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


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import ESCO natural language references."
    )
    parser.add_argument(
        "--csv", type=Path, default=DEFAULT_CSV, help="Path to skills_<lang>.csv"
    )
    parser.add_argument(
        "--limit", type=int, default=None, help="Import at most N rows."
    )
    args = parser.parse_args()

    if not args.csv.exists():
        print(f"ERROR: CSV not found: {args.csv}", file=sys.stderr)
        raise SystemExit(1)

    db_url = os.environ.get("DATABASE_URL") or get_settings().database_url
    engine = create_async_engine(db_url)
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with session_factory() as session:
        stats = await import_esco_languages(session, args.csv, limit=args.limit)
    await engine.dispose()
    print(
        f"\nESCO language import complete: {stats['added']} added, "
        f"{stats['updated']} updated, {stats['skipped']} skipped."
    )


if __name__ == "__main__":
    asyncio.run(main())
