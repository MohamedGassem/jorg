# backend/services/auth_service.py
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from models.user import User, UserRole


class EmailAlreadyRegisteredError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


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
    return user


def issue_token_pair(user: User) -> tuple[str, str]:
    access = create_access_token(
        subject=str(user.id),
        extra={"role": user.role.value},
    )
    refresh = create_refresh_token(subject=str(user.id))
    return access, refresh
