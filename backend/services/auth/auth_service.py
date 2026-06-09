# backend/services/auth_service.py
import hashlib
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_settings
from core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from models.refresh_token import RefreshToken
from models.user import User, UserRole

logger = structlog.get_logger()


class EmailAlreadyRegisteredError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def register_user(
    db: AsyncSession,
    email: str,
    password: str,
    role: UserRole,
) -> User:
    existing = await db.execute(select(User).where(User.email == email.lower()))
    if existing.scalar_one_or_none() is not None:
        raise EmailAlreadyRegisteredError(email)

    user = User(
        email=email.lower(),
        hashed_password=hash_password(password),
        role=role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User:
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if user is None or user.hashed_password is None:
        raise InvalidCredentialsError()
    if not verify_password(password, user.hashed_password):
        raise InvalidCredentialsError()
    if not user.is_active:
        raise InvalidCredentialsError()
    logger.info("auth.login", user_id=str(user.id), role=user.role)
    return user


async def issue_token_pair(db: AsyncSession, user: User) -> tuple[str, str]:
    """Issue a new access+refresh pair. Stores the refresh token hash in DB."""
    settings = get_settings()
    access = create_access_token(
        subject=str(user.id),
        extra={"role": user.role.value},
    )
    refresh = create_refresh_token(subject=str(user.id))
    record = RefreshToken(
        user_id=user.id,
        token_hash=_hash_token(refresh),
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(record)
    await db.commit()
    return access, refresh


async def rotate_refresh_token(db: AsyncSession, raw_token: str) -> tuple[str, str]:
    """Validate raw_token against DB, revoke it, issue a fresh pair.

    Raises InvalidCredentialsError on any invalid state.
    """
    token_hash = _hash_token(raw_token)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    record = result.scalar_one_or_none()

    if record is None or record.revoked_at is not None:
        raise InvalidCredentialsError("invalid or revoked refresh token")

    expires = record.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        raise InvalidCredentialsError("refresh token expired")

    record.revoked_at = datetime.now(UTC)

    user_result = await db.execute(select(User).where(User.id == record.user_id))
    user = user_result.scalar_one_or_none()
    if user is None or not user.is_active:
        await db.commit()
        raise InvalidCredentialsError("user not found or inactive")

    await db.commit()
    return await issue_token_pair(db, user)


async def revoke_refresh_token(db: AsyncSession, raw_token: str) -> None:
    """Revoke a single refresh token. Silent no-op if not found."""
    token_hash = _hash_token(raw_token)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    record = result.scalar_one_or_none()
    if record and record.revoked_at is None:
        record.revoked_at = datetime.now(UTC)
        await db.commit()
