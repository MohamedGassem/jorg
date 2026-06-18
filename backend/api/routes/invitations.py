# backend/api/routes/invitations.py
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import services.invitation_service as invitation_service
from api.deps import RecruiterOrgMember, get_db, require_role
from models.invitation import AccessGrant, AccessGrantStatus, Invitation, InvitationStatus
from models.recruiter import Organization
from models.user import User, UserRole
from schemas.invitation import (
    AcceptInvitationRequest,
    AccessGrantRead,
    InvitationCreate,
    InvitationRead,
    PublicInvitationRead,
    RecruiterInvitationRead,
)

router = APIRouter(tags=["invitations"])

CandidateUser = Annotated[User, Depends(require_role(UserRole.CANDIDATE))]
DB = Annotated[AsyncSession, Depends(get_db)]


# ---- Recruiter: create invitation -------------------------------------------


@router.post(
    "/organizations/{org_id}/invitations",
    response_model=InvitationRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_invitation(
    org_id: UUID,
    data: InvitationCreate,
    member: RecruiterOrgMember,
    db: DB,
) -> Invitation:
    return await invitation_service.create_invitation(
        db, member.user_id, org_id, str(data.candidate_email)
    )


@router.get(
    "/organizations/{org_id}/invitations",
    response_model=list[RecruiterInvitationRead],
)
async def list_org_invitations(
    org_id: UUID,
    member: RecruiterOrgMember,
    db: DB,
) -> list[Invitation]:
    return await invitation_service.list_org_invitations(db, org_id)


@router.delete(
    "/organizations/{org_id}/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def cancel_invitation(
    org_id: UUID, invitation_id: UUID, member: RecruiterOrgMember, db: DB
) -> None:
    invitation = await invitation_service.get_org_invitation(db, org_id, invitation_id)
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invitation not found")
    await invitation_service.cancel_invitation(db, invitation)


@router.post(
    "/organizations/{org_id}/invitations/{invitation_id}/resend",
    response_model=InvitationRead,
)
async def resend_invitation(
    org_id: UUID, invitation_id: UUID, member: RecruiterOrgMember, db: DB
) -> Invitation:
    invitation = await invitation_service.get_org_invitation(db, org_id, invitation_id)
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invitation not found")
    return await invitation_service.resend_invitation(db, invitation)


# ---- Public: resolve a token without authentication -------------------------


@router.get("/public/invitations/{token}", response_model=PublicInvitationRead)
async def public_invitation(token: str, db: DB) -> dict[str, Any]:
    inv = await invitation_service.get_invitation_by_token(db, token)
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invitation not found")
    org_result = await db.execute(
        select(Organization.name).where(Organization.id == inv.organization_id)
    )
    return {
        "organization_name": org_result.scalar_one_or_none(),
        "candidate_email": inv.candidate_email,
        "status": inv.status,
        "expires_at": inv.expires_at,
    }


# ---- Candidate: view + respond to invitations -------------------------------


@router.get("/invitations/me", response_model=list[InvitationRead])
async def list_my_invitations(current_user: CandidateUser, db: DB) -> list[dict[str, Any]]:
    return await invitation_service.list_candidate_invitations(
        db, current_user.email, current_user.id
    )


@router.post(
    "/invitations/{token}/accept",
    response_model=AccessGrantRead,
    status_code=status.HTTP_201_CREATED,
)
async def accept_invitation(
    token: str,
    current_user: CandidateUser,
    db: DB,
    payload: AcceptInvitationRequest | None = None,
) -> AccessGrant:
    invitation = await invitation_service.get_invitation_by_token(db, token)
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invitation not found")
    if invitation.status != InvitationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"invitation is {invitation.status.value}",
        )
    if invitation.candidate_email.lower() != current_user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="this invitation was sent to a different email address",
        )
    scopes = payload or AcceptInvitationRequest()
    return await invitation_service.accept_invitation(
        db,
        invitation,
        current_user.id,
        share_finances=scopes.share_finances,
        share_contact=scopes.share_contact,
    )


@router.post("/invitations/{token}/reject", response_model=InvitationRead)
async def reject_invitation(token: str, current_user: CandidateUser, db: DB) -> Invitation:
    invitation = await invitation_service.get_invitation_by_token(db, token)
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invitation not found")
    if invitation.status != InvitationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"invitation is {invitation.status.value}",
        )
    return await invitation_service.reject_invitation(db, invitation)


# ---- Candidate: access grants -----------------------------------------------


@router.get("/access/me", response_model=list[AccessGrantRead])
async def list_my_grants(current_user: CandidateUser, db: DB) -> list[AccessGrant]:
    return await invitation_service.list_candidate_grants(db, current_user.id)


@router.delete("/access/me/{grant_id}", response_model=AccessGrantRead)
async def revoke_grant(grant_id: UUID, current_user: CandidateUser, db: DB) -> AccessGrant:
    result = await db.execute(
        select(AccessGrant).where(
            AccessGrant.id == grant_id,
            AccessGrant.candidate_id == current_user.id,
        )
    )
    grant = result.scalar_one_or_none()
    if grant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="access grant not found")
    return await invitation_service.revoke_grant(db, grant)


@router.patch("/access/me/{grant_id}", response_model=AccessGrantRead)
async def update_grant_scopes(
    grant_id: UUID,
    payload: AcceptInvitationRequest,
    current_user: CandidateUser,
    db: DB,
) -> AccessGrant:
    result = await db.execute(
        select(AccessGrant).where(
            AccessGrant.id == grant_id,
            AccessGrant.candidate_id == current_user.id,
            AccessGrant.status == AccessGrantStatus.ACTIVE,
        )
    )
    grant = result.scalar_one_or_none()
    if grant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="access grant not found")
    return await invitation_service.update_grant_scopes(
        db,
        grant,
        share_finances=payload.share_finances,
        share_contact=payload.share_contact,
    )
