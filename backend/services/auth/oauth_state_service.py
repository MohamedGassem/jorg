# backend/services/oauth_state_service.py
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete
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
    await db.flush()
    return state


async def consume_state(db: AsyncSession, state: str) -> tuple[str, str] | None:
    """Validate, delete, and return (provider, role) for a state token.

    Returns None if the state is unknown or expired.
    Uses DELETE ... RETURNING for an atomic consume-and-delete that prevents
    replay attacks from concurrent requests with the same state token.
    Cleans up all expired states as a side-effect.
    """
    now = datetime.now(UTC)
    # Atomic: only deletes if state exists AND is not yet expired
    result = await db.execute(
        delete(OAuthState)
        .where(OAuthState.state == state, OAuthState.expires_at >= now)
        .returning(OAuthState.provider, OAuthState.role)
    )
    row = result.one_or_none()
    # Sweep expired rows as a side-effect (separate condition, no overlap with above)
    await db.execute(delete(OAuthState).where(OAuthState.expires_at < now))
    await db.flush()
    if row is None:
        return None
    return row.provider, row.role
