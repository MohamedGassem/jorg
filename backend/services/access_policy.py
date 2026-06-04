"""Single owner of the access predicate: org membership + live access grant."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import ColumnElement, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import ForbiddenError
from models.invitation import AccessGrant, AccessGrantStatus
from models.recruiter import RecruiterProfile


def active_grant_clause() -> ColumnElement[bool]:
    """The single definition of a 'live' access grant, for embedding in queries."""
    return AccessGrant.status == AccessGrantStatus.ACTIVE


async def get_live_access_grant(
    db: AsyncSession, organization_id: UUID, candidate_id: UUID
) -> AccessGrant | None:
    """Lookup form, built on the same clause."""
    result = await db.execute(
        select(AccessGrant).where(
            AccessGrant.candidate_id == candidate_id,
            AccessGrant.organization_id == organization_id,
            active_grant_clause(),
        )
    )
    return result.scalar_one_or_none()


async def require_live_access(
    db: AsyncSession, organization_id: UUID, candidate_id: UUID
) -> AccessGrant:
    grant = await get_live_access_grant(db, organization_id, candidate_id)
    if grant is None:
        raise ForbiddenError("No active access grant for this candidate")
    return grant


def is_member(profile: RecruiterProfile, organization_id: UUID) -> bool:
    return profile.organization_id == organization_id
