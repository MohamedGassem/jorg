# backend/services/invitation_service.py
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_settings
from core.email import EmailMessage, get_email_backend
from core.exceptions import ConflictError, GoneError
from models.invitation import (
    AccessGrant,
    AccessGrantStatus,
    Invitation,
    InvitationStatus,
    invitation_expiry,
    make_invitation_token,
)
from models.user import User
from services import access_policy

logger = structlog.get_logger()


def _send_invitation_email(candidate_email: str, org_name: str | None, has_account: bool) -> None:
    """Notify the invited candidate by email. Never blocks invitation creation."""
    frontend_url = get_settings().frontend_url
    org_label = org_name or "Une organisation"
    if has_account:
        link = f"{frontend_url}/candidate/access"
        action = f"Connectez-vous pour accepter ou refuser : {link}"
    else:
        link = f"{frontend_url}/register?role=candidate"
        action = f"Créez votre espace candidat pour répondre : {link}"
    message = EmailMessage(
        to=candidate_email,
        subject=f"{org_label} souhaite accéder à votre dossier sur Jorg",
        body=(
            "Bonjour,\n\n"
            f"{org_label} vous invite à partager votre dossier de compétences sur Jorg.\n"
            "Rien n'est partagé sans votre accord explicite, et vous pouvez révoquer "
            "l'accès à tout moment.\n\n"
            f"{action}\n\n"
            "Cette invitation expire dans 30 jours."
        ),
    )
    try:
        get_email_backend().send(message)
    except Exception:
        logger.exception("invitation.email_failed", candidate_email=candidate_email)


async def create_invitation(
    db: AsyncSession,
    recruiter_id: UUID,
    organization_id: UUID,
    candidate_email: str,
) -> Invitation:
    """Create an invitation; links to existing candidate user if found."""
    from models.recruiter import Organization

    result = await db.execute(select(User).where(User.email == candidate_email))
    candidate = result.scalar_one_or_none()

    pending_result = await db.execute(
        select(Invitation).where(
            Invitation.organization_id == organization_id,
            Invitation.candidate_email == candidate_email,
            Invitation.status == InvitationStatus.PENDING,
        )
    )
    if pending_result.scalar_one_or_none() is not None:
        raise ConflictError("Une invitation est déjà en attente pour cet email")
    if candidate is not None:
        existing = await access_policy.get_live_access_grant(db, organization_id, candidate.id)
        if existing is not None:
            raise ConflictError("Ce candidat a déjà accordé l'accès à votre organisation")

    org_result = await db.execute(
        select(Organization.name).where(Organization.id == organization_id)
    )
    org_name = org_result.scalar_one_or_none()

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
    _send_invitation_email(candidate_email, org_name, has_account=candidate is not None)
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


async def get_org_invitation(
    db: AsyncSession, organization_id: UUID, invitation_id: UUID
) -> Invitation | None:
    result = await db.execute(
        select(Invitation).where(
            Invitation.id == invitation_id,
            Invitation.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


async def cancel_invitation(db: AsyncSession, invitation: Invitation) -> None:
    """Supprime une invitation pendante (aucun acces n'a encore ete cree)."""
    if invitation.status != InvitationStatus.PENDING:
        raise ConflictError(f"invitation is {invitation.status.value}")
    candidate_email = invitation.candidate_email
    organization_id = invitation.organization_id
    await db.delete(invitation)
    await db.commit()
    logger.info(
        "invitation.cancelled",
        candidate_email=candidate_email,
        organization_id=str(organization_id),
    )


async def resend_invitation(db: AsyncSession, invitation: Invitation) -> Invitation:
    """Re-emet l'email d'une invitation pendante."""
    from models.recruiter import Organization

    if invitation.status != InvitationStatus.PENDING:
        raise ConflictError(f"invitation is {invitation.status.value}")
    org_result = await db.execute(
        select(Organization.name).where(Organization.id == invitation.organization_id)
    )
    user_result = await db.execute(select(User).where(User.email == invitation.candidate_email))
    _send_invitation_email(
        invitation.candidate_email,
        org_result.scalar_one_or_none(),
        has_account=user_result.scalar_one_or_none() is not None,
    )
    logger.info(
        "invitation.resent",
        candidate_email=invitation.candidate_email,
        organization_id=str(invitation.organization_id),
    )
    return invitation


async def list_candidate_invitations(
    db: AsyncSession, candidate_email: str, candidate_id: UUID
) -> list[dict[str, Any]]:
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
                "updated_at": inv.updated_at,
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
    return await access_policy.get_live_access_grant(db, organization_id, candidate_id)


async def accept_invitation(
    db: AsyncSession,
    invitation: Invitation,
    candidate_id: UUID,
    *,
    share_finances: bool = True,
    share_contact: bool = True,
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
        existing.share_finances = share_finances
        existing.share_contact = share_contact
        await db.commit()
        await db.refresh(existing)
        return existing

    grant = AccessGrant(
        candidate_id=candidate_id,
        organization_id=invitation.organization_id,
        status=AccessGrantStatus.ACTIVE,
        granted_at=now,
        share_finances=share_finances,
        share_contact=share_contact,
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
