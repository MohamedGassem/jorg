from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

import services.opportunity_service as opportunity_service
import services.recruiter_service as recruiter_service
from api.deps import get_db, require_role
from models.opportunity import Opportunity
from models.user import User, UserRole
from schemas.opportunity import (
    BulkGenerateRequest,
    BulkGenerateResult,
    OpportunityCreate,
    OpportunityDetail,
    OpportunityRead,
    OpportunityUpdate,
    ShortlistAddRequest,
)

router = APIRouter(prefix="/organizations", tags=["opportunities"])

RecruiterUser = Annotated[User, Depends(require_role(UserRole.RECRUITER))]
DB = Annotated[AsyncSession, Depends(get_db)]


async def _require_membership(db: AsyncSession, user_id: UUID, org_id: UUID) -> None:
    profile = await recruiter_service.get_profile(db, user_id)
    if profile is None or profile.organization_id != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not a member")


async def _get_opp_or_404(db: AsyncSession, opp_id: UUID, org_id: UUID) -> Opportunity:
    opp = await opportunity_service.get_opportunity(db, opp_id, org_id)
    if opp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="opportunity not found")
    return opp


@router.post(
    "/{org_id}/opportunities",
    response_model=OpportunityRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_opportunity(
    org_id: UUID,
    data: OpportunityCreate,
    current_user: RecruiterUser,
    db: DB,
) -> Opportunity:
    await _require_membership(db, current_user.id, org_id)
    return await opportunity_service.create_opportunity(db, org_id, current_user.id, data)


@router.get("/{org_id}/opportunities", response_model=list[OpportunityRead])
async def list_opportunities(
    org_id: UUID, current_user: RecruiterUser, db: DB
) -> list[Opportunity]:
    await _require_membership(db, current_user.id, org_id)
    return await opportunity_service.list_opportunities(db, org_id)


@router.get("/{org_id}/opportunities/{opp_id}", response_model=OpportunityDetail)
async def get_opportunity(
    org_id: UUID, opp_id: UUID, current_user: RecruiterUser, db: DB
) -> OpportunityDetail:
    await _require_membership(db, current_user.id, org_id)
    detail = await opportunity_service.get_opportunity_detail(db, opp_id, org_id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="opportunity not found")
    return detail


@router.patch("/{org_id}/opportunities/{opp_id}", response_model=OpportunityRead)
async def update_opportunity(
    org_id: UUID,
    opp_id: UUID,
    data: OpportunityUpdate,
    current_user: RecruiterUser,
    db: DB,
) -> Opportunity:
    await _require_membership(db, current_user.id, org_id)
    opp = await _get_opp_or_404(db, opp_id, org_id)
    return await opportunity_service.update_opportunity(db, opp, data)


@router.post(
    "/{org_id}/opportunities/{opp_id}/candidates",
    status_code=status.HTTP_201_CREATED,
)
async def add_to_shortlist(
    org_id: UUID,
    opp_id: UUID,
    data: ShortlistAddRequest,
    current_user: RecruiterUser,
    db: DB,
) -> dict[str, str]:
    await _require_membership(db, current_user.id, org_id)
    await _get_opp_or_404(db, opp_id, org_id)
    await opportunity_service.add_to_shortlist(db, opp_id, org_id, data.candidate_id)
    return {"status": "added"}


@router.delete(
    "/{org_id}/opportunities/{opp_id}/candidates/{candidate_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_from_shortlist(
    org_id: UUID,
    opp_id: UUID,
    candidate_id: UUID,
    current_user: RecruiterUser,
    db: DB,
) -> None:
    await _require_membership(db, current_user.id, org_id)
    await _get_opp_or_404(db, opp_id, org_id)
    removed = await opportunity_service.remove_from_shortlist(db, opp_id, candidate_id)
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="entry not found")


@router.post(
    "/{org_id}/opportunities/{opp_id}/generate",
    response_model=list[BulkGenerateResult],
)
async def bulk_generate(
    org_id: UUID,
    opp_id: UUID,
    data: BulkGenerateRequest,
    current_user: RecruiterUser,
    db: DB,
) -> list[BulkGenerateResult]:
    await _require_membership(db, current_user.id, org_id)
    await _get_opp_or_404(db, opp_id, org_id)
    return await opportunity_service.bulk_generate(
        db,
        opportunity_id=opp_id,
        organization_id=org_id,
        template_id=data.template_id,
        generated_by_user_id=current_user.id,
        fmt=data.format,
    )
