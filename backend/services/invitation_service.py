# backend/services/invitation_service.py
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import GoneError
from models.invitation import (
    AccessGrant,
    AccessGrantStatus,
    Invitation,
    InvitationStatus,
    invitation_expiry,
    make_invitation_token,
)
from models.user import User

logger = structlog.get_logger()


async def create_invitation(
    db: AsyncSession,
    recruiter_id: UUID,
    organization_id: UUID,
    candidate_email: str,
) -> Invitation:
    """Create an invitation; links to existing candidate user if found."""
    result = await db.execute(select(User).where(User.email == candidate_email))
    candidate = result.scalar_one_or_none()

    invitation = Invitation(
        recruiter_id=recruiter_id,
        organization_id=organization_id,
        candidate_email=candidate_email,
        candidate_id=candidate.id if candidate else None,
        token=make_invitation_token(),
        status=InvitationStatus.PENDING,
        expires_at=invitation_expiry(),
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)
    logger.info(
        "invitation.sent",
        recruiter_id=str(invitation.recruiter_id),
        candidate_email=invitation.candidate_email,
        organization_id=str(invitation.organization_id),
    )
    return invitation


async def get_invitation_by_token(db: AsyncSession, token: str) -> Invitation | None:
    result = await db.execute(select(Invitation).where(Invitation.token == token))
    return result.scalar_one_or_none()


async def list_candidate_invitations(
    db: AsyncSession, candidate_email: str, candidate_id: UUID
) -> list[dict]:
    """Return invitations with org name joined."""
    from models.recruiter import Organization

    rows = await db.execute(
        select(Invitation, Organization.name.label("organization_name"))
        .outerjoin(Organization, Invitation.organization_id == Organization.id)
        .where(
            (Invitation.candidate_email == candidate_email)
            | (Invitation.candidate_id == candidate_id)
        )
    )
    result = []
    for row in rows.all():
        inv = row.Invitation
        result.append(
            {
                "id": inv.id,
                "recruiter_id": inv.recruiter_id,
                "organization_id": inv.organization_id,
                "organization_name": row.organization_name,
                "candidate_email": inv.candidate_email,
                "candidate_id": inv.candidate_id,
                "token": inv.token,
                "status": inv.status,
                "expires_at": inv.expires_at,
                "created_at": inv.created_at,
            }
        )
    return result


async def list_org_invitations(db: AsyncSession, org_id: UUID) -> list[Invitation]:
    """Return all invitations sent by an organization."""
    result = await db.execute(select(Invitation).where(Invitation.organization_id == org_id))
    return list(result.scalars().all())


async def get_active_grant(
    db: AsyncSession, candidate_id: UUID, organization_id: UUID
) -> AccessGrant | None:
    """Return the active AccessGrant for a candidate+org pair, or None."""
    result = await db.execute(
        select(AccessGrant).where(
            AccessGrant.candidate_id == candidate_id,
            AccessGrant.organization_id == organization_id,
            AccessGrant.status == AccessGrantStatus.ACTIVE,
        )
    )
    return result.scalar_one_or_none()


async def accept_invitation(
    db: AsyncSession, invitation: Invitation, candidate_id: UUID
) -> AccessGrant:
    """Accept invitation → create (or return existing) AccessGrant.

    Raises BusinessRuleError("invitation_expired") if token is past its expiry.
    """
    now = datetime.now(UTC)
    expires = invitation.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < now:
        invitation.status = InvitationStatus.EXPIRED
        await db.commit()
        raise GoneError("Invitation has expired")

    invitation.status = InvitationStatus.ACCEPTED
    invitation.candidate_id = candidate_id

    existing = await get_active_grant(db, candidate_id, invitation.organization_id)
    if existing is not None:
        await db.commit()
        return existing

    grant = AccessGrant(
        candidate_id=candidate_id,
        organization_id=invitation.organization_id,
        status=AccessGrantStatus.ACTIVE,
        granted_at=now,
    )
    db.add(grant)
    await db.commit()
    await db.refresh(grant)
    logger.info(
        "access.granted",
        candidate_id=str(grant.candidate_id),
        organization_id=str(grant.organization_id),
    )
    return grant


async def reject_invitation(db: AsyncSession, invitation: Invitation) -> Invitation:
    invitation.status = InvitationStatus.REJECTED
    await db.commit()
    await db.refresh(invitation)
    return invitation


async def list_candidate_grants(db: AsyncSession, candidate_id: UUID) -> list[AccessGrant]:
    result = await db.execute(select(AccessGrant).where(AccessGrant.candidate_id == candidate_id))
    return list(result.scalars().all())


async def revoke_grant(db: AsyncSession, grant: AccessGrant) -> AccessGrant:
    grant.status = AccessGrantStatus.REVOKED
    grant.revoked_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(grant)
    logger.info(
        "access.revoked",
        candidate_id=str(grant.candidate_id),
        organization_id=str(grant.organization_id),
    )
    return grant
