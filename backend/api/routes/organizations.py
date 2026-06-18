# backend/api/routes/organizations.py
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

import services.recruiter_service as recruiter_service
from api.deps import RecruiterOrgMember, get_db, require_role
from core.limiter import limiter
from models.candidate_profile import AvailabilityStatus, ContractType, MissionDuration, WorkMode
from models.recruiter import Organization, RecruiterProfile
from models.user import User, UserRole
from schemas.recruiter import (
    AccessibleCandidateDetail,
    AccessibleCandidateRead,
    OrganizationCreate,
    OrganizationRead,
    OrgJoinRequest,
    OrgMemberRead,
    RecruiterProfileRead,
)
from services import access_policy

router = APIRouter(prefix="/organizations", tags=["organizations"])

RecruiterUser = Annotated[User, Depends(require_role(UserRole.RECRUITER))]
DB = Annotated[AsyncSession, Depends(get_db)]


async def _get_org_or_404(db: AsyncSession, org_id: UUID) -> Organization:
    org = await recruiter_service.get_organization(db, org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization not found")
    return org


# ---- Organization CRUD ------------------------------------------------------


@router.post("", response_model=OrganizationRead, status_code=status.HTTP_201_CREATED)
async def create_organization(
    data: OrganizationCreate, current_user: RecruiterUser, db: DB
) -> Organization:
    return await recruiter_service.create_organization(db, data, created_by_user_id=current_user.id)


@router.get("/{org_id}", response_model=OrganizationRead)
async def get_organization(org_id: UUID, current_user: RecruiterUser, db: DB) -> Organization:
    org = await _get_org_or_404(db, org_id)
    profile = await recruiter_service.get_or_create_profile(db, current_user.id)
    if not access_policy.is_member(profile, org_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="you do not belong to this organization",
        )
    return org


@router.post("/join", response_model=RecruiterProfileRead)
@limiter.limit("10/minute")
async def join_organization_by_code(
    request: Request,
    data: OrgJoinRequest,
    current_user: RecruiterUser,
    db: DB,
) -> RecruiterProfile:
    try:
        return await recruiter_service.join_organization(db, current_user.id, data.code)
    except ValueError as e:
        if str(e) == "already_in_org":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="already affiliated with a different organization",
            ) from e
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="invalid join code"
        ) from e


@router.post("/{org_id}/regenerate-join-code", response_model=OrganizationRead)
async def regenerate_join_code_route(
    org_id: UUID, member: RecruiterOrgMember, db: DB
) -> Organization:
    org = await _get_org_or_404(db, org_id)
    return await recruiter_service.regenerate_join_code(db, org)


@router.get("/{org_id}/members", response_model=list[OrgMemberRead])
async def list_members(org_id: UUID, member: RecruiterOrgMember, db: DB) -> list[dict[str, Any]]:
    await _get_org_or_404(db, org_id)
    return await recruiter_service.list_org_members(db, org_id)


# ---- Candidates -------------------------------------------------------------


@router.get("/{org_id}/candidates", response_model=list[AccessibleCandidateRead])
async def list_accessible_candidates(
    org_id: UUID,
    member: RecruiterOrgMember,
    db: DB,
    availability_status: Annotated[AvailabilityStatus | None, Query()] = None,
    work_mode: Annotated[WorkMode | None, Query()] = None,
    contract_type: Annotated[ContractType | None, Query()] = None,
    mission_duration: Annotated[MissionDuration | None, Query()] = None,
    max_daily_rate: int | None = Query(default=None),
    skill: str | None = Query(default=None),
    location: str | None = Query(default=None),
    domain: str | None = Query(default=None),
    q: str | None = Query(default=None),
) -> list[dict[str, object]]:
    await _get_org_or_404(db, org_id)
    return await recruiter_service.list_accessible_candidates(
        db,
        org_id,
        availability_status=availability_status,
        work_mode=work_mode,
        contract_type=contract_type,
        mission_duration=mission_duration,
        max_daily_rate=max_daily_rate,
        skill=skill,
        location=location,
        domain=domain,
        q=q,
    )


@router.get("/{org_id}/candidates/{candidate_id}", response_model=AccessibleCandidateDetail)
async def get_candidate_detail(
    org_id: UUID, candidate_id: UUID, member: RecruiterOrgMember, db: DB
) -> dict[str, Any]:
    await _get_org_or_404(db, org_id)
    grant = await access_policy.require_live_access(db, org_id, candidate_id)
    return await recruiter_service.get_accessible_candidate_detail(db, org_id, candidate_id, grant)
