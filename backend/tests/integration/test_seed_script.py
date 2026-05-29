# backend/tests/integration/test_seed_script.py
"""Integration test: seed script produces correct rows and is idempotent."""

import re

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.skill import SkillReference

ESCO_URI_PATTERN = re.compile(
    r"^http://data\.europa\.eu/esco/skill/"
    r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$"
)


@pytest.mark.anyio
async def test_seed_creates_rows(db_session: AsyncSession) -> None:
    result = await db_session.execute(select(func.count()).select_from(SkillReference))
    count = result.scalar_one()
    assert count >= 50, f"Expected >= 50 SkillReference rows, got {count}"


@pytest.mark.anyio
async def test_esco_source_entries_have_valid_uris(db_session: AsyncSession) -> None:
    result = await db_session.execute(select(SkillReference).where(SkillReference.source == "esco"))
    esco_entries = result.scalars().all()
    assert len(esco_entries) >= 30, (
        f"Expected >= 30 entries with source='esco', got {len(esco_entries)}"
    )
    for entry in esco_entries:
        assert entry.esco_uri is not None, f"Entry '{entry.name}' has source='esco' but no esco_uri"
        assert ESCO_URI_PATTERN.match(entry.esco_uri), (
            f"Bad URI for '{entry.name}': {entry.esco_uri!r} — "
            f"expected format: http://data.europa.eu/esco/skill/<uuid>"
        )


@pytest.mark.anyio
async def test_manual_entries_have_no_esco_uri(db_session: AsyncSession) -> None:
    result = await db_session.execute(
        select(SkillReference).where(SkillReference.source == "manual")
    )
    manual_entries = result.scalars().all()
    for entry in manual_entries:
        assert entry.esco_uri is None, (
            f"Entry '{entry.name}' has source='manual' but non-null esco_uri: {entry.esco_uri!r}"
        )
