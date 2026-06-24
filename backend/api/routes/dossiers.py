# backend/api/routes/dossiers.py
"""Dossier APIs (slice 2): candidate and recruiter composition over L2 evidence.

One flat ``/dossiers`` namespace; ownership and the live-grant requirement
(decision #6) are resolved per request from the dossier row and the current user.
The canonical generator is ``POST /dossiers/{id}/generate`` (decision #8).
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

import services.candidate_service as candidate_service
import services.documents.generation_service as generation_service
import services.dossier_service as dossier_service
import services.recruiter_service as recruiter_service
from api.deps import CurrentUser, get_db
from core.exceptions import BusinessRuleError, ForbiddenError, NotFoundError
from core.limiter import limiter
from models.dossier import Dossier, DossierOwnerType
from models.generated_document import GeneratedDocument
from models.user import User, UserRole
from schemas.dossier import (
    CompositionPoolItem,
    DossierCreate,
    DossierGenerateRequest,
    DossierMetadataUpdate,
    DossierRead,
    ExperienceSelectionWrite,
    SkillSelectionWrite,
)
from schemas.generation import GeneratedDocumentRead
from services import access_policy

router = APIRouter(prefix="/dossiers", tags=["dossiers"])

DB = Annotated[AsyncSession, Depends(get_db)]


async def _require_recruiter_live_grant(
    db: AsyncSession, user: User, *, organization_id: UUID, access_grant_id: UUID | None
) -> None:
    """A recruiter operates a dossier only through a live grant (decision #6).

    Membership (who the user is) is an API-boundary concern; grant liveness is a
    business rule the service layer owns (``dossier_service.require_live_grant``),
    so it holds for every caller, not only this route.
    """
    profile = await recruiter_service.get_profile(db, user.id)
    if profile is None or not access_policy.is_member(profile, organization_id):
        raise ForbiddenError("you do not belong to this organization")
    await dossier_service.require_live_grant(db, access_grant_id)


async def _authorized_dossier(db: AsyncSession, dossier_id: UUID, user: User) -> Dossier:
    """Load a dossier (with selections) the current user is allowed to operate."""
    dossier = await dossier_service.load_with_selections(db, dossier_id)
    if dossier is None:
        raise NotFoundError("dossier not found")
    if user.role == UserRole.CANDIDATE:
        if (
            dossier.owner_type != DossierOwnerType.CANDIDATE
            or dossier.candidate_owner_id != user.id
        ):
            raise ForbiddenError("not your dossier")
    else:
        if dossier.owner_type != DossierOwnerType.RECRUITER or dossier.organization_id is None:
            raise ForbiddenError("not your dossier")
        await _require_recruiter_live_grant(
            db,
            user,
            organization_id=dossier.organization_id,
            access_grant_id=dossier.access_grant_id,
        )
    return dossier


@router.post("", response_model=DossierRead, status_code=status.HTTP_201_CREATED)
async def create_dossier(data: DossierCreate, current_user: CurrentUser, db: DB) -> Dossier:
    if current_user.role == UserRole.CANDIDATE:
        profile = await candidate_service.get_or_create_profile(db, current_user.id)
        return await dossier_service.create_candidate_dossier(
            db,
            candidate_profile_id=profile.id,
            candidate_owner_id=current_user.id,
            name=data.name,
            objectif=data.objectif,
            accroche=data.accroche,
            share_contact=data.share_contact,
            share_finances=data.share_finances,
        )
    if data.candidate_id is None or data.organization_id is None:
        raise BusinessRuleError("candidate_id and organization_id are required")
    grant = await access_policy.require_live_access(db, data.organization_id, data.candidate_id)
    await _require_recruiter_live_grant(
        db, current_user, organization_id=data.organization_id, access_grant_id=grant.id
    )
    profile = await candidate_service.get_or_create_profile(db, data.candidate_id)
    return await dossier_service.create_recruiter_dossier(
        db,
        candidate_profile_id=profile.id,
        organization_id=data.organization_id,
        access_grant_id=grant.id,
        recruiter_owner_id=current_user.id,
        name=data.name,
        objectif=data.objectif,
        accroche=data.accroche,
        share_contact=data.share_contact,
        share_finances=data.share_finances,
    )


@router.get("", response_model=list[DossierRead])
async def list_dossiers(
    current_user: CurrentUser,
    db: DB,
    organization_id: UUID | None = None,
    candidate_id: UUID | None = None,
) -> list[Dossier]:
    if current_user.role == UserRole.CANDIDATE:
        profile = await candidate_service.get_or_create_profile(db, current_user.id)
        return await dossier_service.list_candidate_dossiers(db, profile.id)
    if organization_id is None or candidate_id is None:
        raise BusinessRuleError("organization_id and candidate_id are required")
    grant = await access_policy.require_live_access(db, organization_id, candidate_id)
    await _require_recruiter_live_grant(
        db, current_user, organization_id=organization_id, access_grant_id=grant.id
    )
    return await dossier_service.list_recruiter_dossiers(db, grant.id)


@router.get("/{dossier_id}", response_model=DossierRead)
async def get_dossier(dossier_id: UUID, current_user: CurrentUser, db: DB) -> Dossier:
    return await _authorized_dossier(db, dossier_id, current_user)


@router.patch("/{dossier_id}", response_model=DossierRead)
async def update_dossier_metadata(
    dossier_id: UUID, data: DossierMetadataUpdate, current_user: CurrentUser, db: DB
) -> Dossier:
    dossier = await _authorized_dossier(db, dossier_id, current_user)
    return await dossier_service.update_metadata(
        db, dossier, fields=data.model_dump(exclude_unset=True)
    )


@router.put("/{dossier_id}/experiences", response_model=DossierRead)
async def replace_experience_selections(
    dossier_id: UUID,
    items: list[ExperienceSelectionWrite],
    current_user: CurrentUser,
    db: DB,
) -> Dossier:
    dossier = await _authorized_dossier(db, dossier_id, current_user)
    return await dossier_service.replace_experience_selections(
        db, dossier, [(i.experience_id, i.is_featured) for i in items]
    )


@router.put("/{dossier_id}/skills", response_model=DossierRead)
async def replace_skill_selections(
    dossier_id: UUID,
    items: list[SkillSelectionWrite],
    current_user: CurrentUser,
    db: DB,
) -> Dossier:
    dossier = await _authorized_dossier(db, dossier_id, current_user)
    return await dossier_service.replace_skill_selections(
        db, dossier, [(i.candidate_skill_id, i.is_featured) for i in items]
    )


@router.get("/{dossier_id}/composition-pool", response_model=list[CompositionPoolItem])
async def get_composition_pool(
    dossier_id: UUID, current_user: CurrentUser, db: DB
) -> list[CompositionPoolItem]:
    dossier = await _authorized_dossier(db, dossier_id, current_user)
    experiences = await dossier_service.composition_pool(db, dossier)
    return [
        CompositionPoolItem(
            experience_id=exp.id,
            role=exp.role,
            client_name=exp.client_name,
            start_date=exp.start_date,
            end_date=exp.end_date,
            is_current=exp.is_current,
        )
        for exp in experiences
    ]


@router.post(
    "/{dossier_id}/generate",
    response_model=GeneratedDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
async def generate_from_dossier(
    request: Request,
    dossier_id: UUID,
    data: DossierGenerateRequest,
    current_user: CurrentUser,
    db: DB,
) -> GeneratedDocument:
    dossier = await _authorized_dossier(db, dossier_id, current_user)
    return await generation_service.generate_from_dossier(
        db,
        dossier=dossier,
        template_id=data.template_id,
        system_template_key=data.system_template_key,
        fmt=data.format,
        generated_by_user_id=current_user.id,
    )
