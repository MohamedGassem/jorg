from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from models.alpha import AlphaInviteCode
from services.auth.alpha_service import (
    InvalidAlphaCodeError,
    create_alpha_codes,
    validate_and_consume_code,
)


@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        # Create only the alpha_invite_codes table.
        # SQLite does not enforce FK constraints by default, so the FK
        # referencing recruiter_profiles.id is harmless here.
        await conn.run_sync(AlphaInviteCode.__table__.create)  # type: ignore[attr-defined]
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as session:
        yield session
    await engine.dispose()


@pytest.mark.asyncio
async def test_create_alpha_codes_returns_correct_count(db: AsyncSession) -> None:
    codes = await create_alpha_codes(db, count=5)
    assert len(codes) == 5
    for code in codes:
        assert code.startswith("JORG-")


@pytest.mark.asyncio
async def test_validate_valid_code_returns_code_object(db: AsyncSession) -> None:
    codes = await create_alpha_codes(db, count=1)
    result = await validate_and_consume_code(db, codes[0], consume=False)
    assert result is not None
    assert result.code == codes[0]


@pytest.mark.asyncio
async def test_validate_invalid_code_raises(db: AsyncSession) -> None:
    with pytest.raises(InvalidAlphaCodeError):
        await validate_and_consume_code(db, "JORG-FAKE-CODE", consume=False)


@pytest.mark.asyncio
async def test_consume_marks_used_by(db: AsyncSession) -> None:
    from uuid import uuid4

    codes = await create_alpha_codes(db, count=1)
    recruiter_id = uuid4()
    await validate_and_consume_code(db, codes[0], consume=True, recruiter_id=recruiter_id)
    # Second call should raise
    with pytest.raises(InvalidAlphaCodeError):
        await validate_and_consume_code(db, codes[0], consume=False)
