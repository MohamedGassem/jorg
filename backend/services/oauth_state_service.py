# backend/services/oauth_state_service.py
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.oauth_state import OAuthState

_TTL_MINUTES = 10


async def create_state(db: AsyncSession, provider: str, role: str) -> str:
    """Create an OAuth CSRF state token, persist it, and return the token."""
    state = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    db.add(
        OAuthState(
            state=state,
            provider=provider,
            role=role,
            created_at=now,
            expires_at=now + timedelta(minutes=_TTL_MINUTES),
        )
    )
    await db.commit()
    return state


async def consume_state(db: AsyncSession, state: str) -> tuple[str, str] | None:
    """Validate, delete, and return (provider, role) for a state token.

    Returns None if the state is unknown or expired.
    Cleans up all expired states as a side-effect.
    """
    now = datetime.now(UTC)
    await db.execute(delete(OAuthState).where(OAuthState.expires_at < now))

    result = await db.execute(select(OAuthState).where(OAuthState.state == state))
    entry = result.scalar_one_or_none()
    if entry is None:
        await db.commit()
        return None

    provider = entry.provider
    role = entry.role
    await db.delete(entry)
    await db.commit()
    return provider, role
