from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.alpha import AlphaInviteCode, _generate_code


class InvalidAlphaCodeError(Exception):
    """Raised when an alpha invite code is invalid or already used."""


async def create_alpha_codes(db: AsyncSession, count: int = 10) -> list[str]:
    codes = []
    for _ in range(count):
        obj = AlphaInviteCode(code=_generate_code())
        db.add(obj)
        codes.append(obj.code)
    await db.commit()
    return codes


async def validate_and_consume_code(
    db: AsyncSession,
    code: str,
    *,
    consume: bool,
    recruiter_id: UUID | None = None,
) -> AlphaInviteCode:
    result = await db.execute(select(AlphaInviteCode).where(AlphaInviteCode.code == code.upper()))
    obj = result.scalar_one_or_none()
    if obj is None or obj.used_by is not None:
        raise InvalidAlphaCodeError(code)
    if consume:
        obj.used_by = recruiter_id
        obj.used_at = datetime.now(UTC)
        await db.commit()
    return obj
