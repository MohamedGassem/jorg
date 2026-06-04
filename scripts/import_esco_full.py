#!/usr/bin/env python
# scripts/import_esco_full.py
"""Import the FULL ESCO skills taxonomy (data/esco/skills_fr.csv) into the DB.

This complements scripts/seed_skill_references.py (which loads a small curated
set). It is idempotent: rows already present (by esco_uri) are skipped, so it
is safe to re-run.

Usage:
    uv run python scripts/import_esco_full.py
    uv run python scripts/import_esco_full.py --limit 500      # smoke test
    uv run python scripts/import_esco_full.py --csv data/esco/skills_fr.csv
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from services.esco_import_service import import_esco_skills  # noqa: E402

DEFAULT_CSV = ROOT / "data" / "esco" / "skills_fr.csv"


async def main() -> None:
    parser = argparse.ArgumentParser(description="Import full ESCO skills taxonomy.")
    parser.add_argument(
        "--csv", type=Path, default=DEFAULT_CSV, help="Path to skills_<lang>.csv"
    )
    parser.add_argument(
        "--limit", type=int, default=None, help="Import at most N rows (testing)."
    )
    parser.add_argument(
        "--batch-size", type=int, default=1000, help="Commit every N inserts."
    )
    args = parser.parse_args()

    if not args.csv.exists():
        print(f"ERROR: CSV not found: {args.csv}", file=sys.stderr)
        raise SystemExit(1)

    db_url = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://jorg:jorg@localhost:5432/jorg",
    )
    engine = create_async_engine(db_url)
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    print(f"Importing ESCO skills from {args.csv} …")
    async with session_factory() as session:
        stats = await import_esco_skills(
            session, args.csv, batch_size=args.batch_size, limit=args.limit
        )
    await engine.dispose()
    print(
        f"\nESCO import complete: {stats['added']} added, "
        f"{stats['skipped_existing']} already present, "
        f"{stats['skipped_invalid']} skipped (invalid/non-released)."
    )


if __name__ == "__main__":
    asyncio.run(main())
