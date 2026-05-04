# backend/api/routes/invitations.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import services.invitation_service as invitation_service
import services.recruiter_service as recruiter_service
from api.deps import get_db, require_role
from models.invitation import AccessGrant, Invitation, InvitationStatus
from models.user import User, UserRole
from schemas.invitation import AccessGrantRead, InvitationCreate, InvitationRead

router = APIRouter(tags=["invitations"])

RecruiterUser = Annotated[User, Depends(require_role(UserRole.RECRUITER))]
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
    current_user: RecruiterUser,
    db: DB,
) -> Invitation:
    profile = await recruiter_service.get_or_create_profile(db, current_user.id)
    if profile.organization_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="you do not belong to this organization",
        )
    return await invitation_service.create_invitation(
        db, current_user.id, org_id, str(data.candidate_email)
    )


# ---- Candidate: view + respond to invitations -------------------------------


@router.get("/invitations/me", response_model=list[InvitationRead])
async def list_my_invitations(current_user: CandidateUser, db: DB) -> list[Invitation]:
    return await invitation_service.list_candidate_invitations(
        db, current_user.email, current_user.id
    )


@router.post(
    "/invitations/{token}/accept",
    response_model=AccessGrantRead,
    status_code=status.HTTP_201_CREATED,
)
async def accept_invitation(token: str, current_user: CandidateUser, db: DB) -> AccessGrant:
    invitation = await invitation_service.get_invitation_by_token(db, token)
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invitation not found")
    if invitation.status != InvitationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"invitation is {invitation.status.value}",
        )
    return await invitation_service.accept_invitation(db, invitation, current_user.id)


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
